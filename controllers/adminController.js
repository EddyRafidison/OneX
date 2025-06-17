// controllers/adminController.js

const BigNumber = require("bignumber.js");
const { pool } = require("../config/database");
const { decrypt } = require("../utils/encryption");
const { getDate } = require("../utils/dateUtils");
const { createTransactionId } = require("../utils/idUtils");

const ADMIN_PSWD = process.env.ADMIN_PSWD;
const ADMIN_PIN  = process.env.ADMIN_PIN;

/**
 * Vérifie les identifiants admin.
 */
function verifyAdmin(pswd, pin) {
  const realPwd = decrypt(ADMIN_PSWD, process.env.DB_PSWD);
  const realPin = decrypt(ADMIN_PIN,  process.env.DB_PSWD);
  return pswd === realPwd && pin === realPin;
}

/**
 * POST /admin/set-user-status
 * Change le status d’un utilisateur.
 */
async function setUserStatus(req, res) {
  const { pswd, pin, user, status } = req.body;
  if (!verifyAdmin(pswd, pin)) {
    return res.json({ error: "incorrect auth" });
  }

  const newStatus = Number(status);
  if (Number.isNaN(newStatus)) {
    return res.json({ error: "invalid status" });
  }

  const username = user.replaceAll(" ", "+").toUpperCase();
  try {
    await pool
      .promise()
      .query(
        "UPDATE auths SET status = ? WHERE username = ?",
        [newStatus, username]
      );
    res.json({ account: "updated" });
  } catch (err) {
    console.error("setUserStatus error:", err);
    res.json({ error: "db error" });
  }
}

/**
 * POST /admin/add-to-feed
 * Ajoute une notification au fil.
 */
async function addToFeed(req, res) {
  const { pswd, pin, content } = req.body;
  if (!verifyAdmin(pswd, pin)) {
    return res.json({ error: "incorrect auth" });
  }

  const [record_date, record_time] = getDate();
  try {
    await pool
      .promise()
      .query(
        "INSERT INTO notifs (content, record_date, record_time) VALUES (?, ?, ?)",
        [content, record_date, record_time]
      );
    res.json({ notif: "added" });
  } catch (err) {
    console.error("addToFeed error:", err);
    res.json({ error: "db error" });
  }
}

/**
 * POST /admin/update-user-or-common-stock
 * Soit on crédite un utilisateur, soit on renforce le stock commun.
 */
async function updateUserOrCommonStock(req, res) {
  const { pswd, pin, amount, user } = req.body;
  if (!verifyAdmin(pswd, pin)) {
    return res.json({ auth: "incorrect" });
  }

  const amt = new BigNumber(amount);
  if (!amt.isFinite() || amt.lte(0)) {
    return res.json({ error: "invalid amount" });
  }

  const [record_date, record_time] = getDate();

  // Récupérer le dernier état du stock commun
  let lastCommon;
  try {
    [lastCommon] = await pool
      .promise()
      .query(
        "SELECT total_units_price, unit_price, backed_units FROM common ORDER BY id DESC LIMIT 1"
      )
      .then(([rows]) => rows);
    if (!lastCommon) throw new Error("no common row");
  } catch (err) {
    console.error("fetch common error:", err);
    return res.json({ error: "failed" });
  }

  const totalUnitsPrice = new BigNumber(lastCommon.total_units_price);
  const unitPrice       = new BigNumber(lastCommon.unit_price);
  const backedUnits     = new BigNumber(lastCommon.backed_units);

  // Calculs
  const newTotalUnitsPrice = totalUnitsPrice.plus(amt);
  const backedUnitsValue   = backedUnits.multipliedBy(unitPrice);

  if (amt.gt(backedUnitsValue)) {
    return res.json({ limit: `AR ${backedUnitsValue.toFixed()}` });
  }

  // Ce qui reste de backed_units après opération
  const remainedBackedUnits = backedUnits.minus(amt.dividedBy(unitPrice));

  const username = user.replaceAll(" ", "+").toUpperCase();

  // Cas : on crédite un client
  if (username.includes("-")) {
    let conn;
    try {
      conn = await pool.promise().getConnection();
      await conn.beginTransaction();

      // Récup balance du client
      const [[{ balance: balStr }]] = await conn.query(
        "SELECT balance FROM users_stock WHERE username = ?",
        [username]
      );
      const balance = new BigNumber(balStr);

      // 1) activité
      const reference = createTransactionId(username);
      await conn.query(
        `INSERT INTO activities
          (sender, receiver, type, amount, unit_price, fees, reference, record_date, record_time)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        ["ONEX", username, 2, amt.toFixed(), unitPrice.toFixed(), "0", reference, record_date, record_time]
      );

      // 2) mise à jour balance client
      const newUserBalance = balance.plus(amt.dividedBy(unitPrice));
      await conn.query(
        "UPDATE users_stock SET balance = ?, record_date = ?, record_time = ? WHERE username = ?",
        [newUserBalance.toFixed(), record_date, record_time, username]
      );

      // 3) mise à jour du stock commun (unit_price reste à 1)
      await conn.query(
        `INSERT INTO common
          (total_units_price, unit_price, backed_units, record_date, record_time)
         VALUES(?,?,?,?,?)`,
        [
          newTotalUnitsPrice.toFixed(),
          "1",
          remainedBackedUnits.toFixed(),
          record_date,
          record_time,
        ]
      );

      await conn.commit();
      res.json({ transf: "sent" });
    } catch (err) {
      if (conn) {
        await conn.rollback().catch(() => {});
        conn.release();
      }
      console.error("credit client error:", err);
      res.json({ error: "failed" });
    } finally {
      if (conn) conn.release();
    }

  } else {
    // Cas : on renforce le stock commun
    try {
      // recalcul du unit_price
      const newUnitPrice = newTotalUnitsPrice
        .dividedBy(totalUnitsPrice)
        .multipliedBy(unitPrice);

      await pool
        .promise()
        .query(
          `INSERT INTO common
            (total_units_price, unit_price, backed_units, record_date, record_time)
           VALUES(?,?,?,?,?)`,
          [
            newTotalUnitsPrice.toFixed(),
            newUnitPrice.toFixed(),
            remainedBackedUnits.toFixed(),
            record_date,
            record_time,
          ]
        );
      res.json({ total_units_price: "updated" });
    } catch (err) {
      console.error("reinforce stock error:", err);
      res.json({ error: "failed" });
    }
  }
}

module.exports = {
  setUserStatus,
  addToFeed,
  updateUserOrCommonStock,
};
