const path = require("path");
const fs = require("fs");
const geoip = require("geoip-country");
const BigNumber = require("bignumber.js");
const { pool }     = require("../config/database");
const transporter  = require("../config/mailer");
const { encrypt, decrypt } = require("../utils/encryption");
const { getDate }         = require("../utils/dateUtils");
const { getUserPrefix, createUserSuffix, createTransactionId } = require("../utils/idUtils");

const ONE_X     = "ONEX";
const P2P_ALLOWED       = process.env.P2P_ALLOWED === "true";
const MAX_STOCK_DEFAULT = +process.env.MAX_STOCK_DEFAULT;
const FEES              = +process.env.FEES;
const APP_VERSION       = process.env.APP_VERSION;
const WELCOME_BONUS     = +process.env.WELCOME_BONUS;
const FIRST_CLIENTS     = +process.env.FIRST_WELCOME_CLIENTS;

// Helper pour vérifier token UA
function verifyUA(req, user, pswd, tkn) {
  const ua = req.headers["user-agent"];
  return ua === decrypt(tkn, pswd + user);
}

// — GET /app/download-latest-apk
async function downloadApk(req, res, next) {
  const apkPath = path.resolve("./OneX.apk");
  res.download(apkPath, "OneX.apk", err => err ? next(err) : null);
}

// — POST /app/check-app-version
function checkAppVersion(_req, res) {
  const sizeMB = fs.statSync("./OneX.apk").size / (1024*1024);
  res.json({ version: APP_VERSION, size: sizeMB.toFixed(2) });
}

// — POST /app/signup
async function signup(req, res) {
  try {
    const { email, birth, addr, name, cni, pswd, seed, cniimg1, cniimg2 } = req.body;
    const ip   = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const geo  = geoip.lookup(ip);
    if (!geo || geo.country !== "MG") return res.json({ msg: "unsupported country" });

    const UserPrefix = getUserPrefix(name);
    const UserSuffix = createUserSuffix(cni);
    const username   = `${UserPrefix}-${UserSuffix}`.toUpperCase();
    const encPwd     = encrypt(pswd.replaceAll(" ","+"), process.env.DB_PSWD);
    const encSeed    = encrypt(seed.replaceAll(" ","+"), process.env.DB_PSWD);
    const encCni     = encrypt(cni.replaceAll(" ","+"), process.env.DB_PSWD);
    const [rDate, rTime] = getDate();

    // Vérifier unicité
    const exists = await pool.promiseQuery("SELECT 1 FROM auths WHERE username=?", [username]);
    if (exists.length) return res.json({ msg: "retry" });

    const conn = await pool.promiseQuery("BEGIN");
    await pool.promiseQuery(
      `INSERT INTO auths
         (username,password,name,email,birthdate,cni,address,seed,status,record_date,record_time)
       VALUES (?,?,?,?,?,?,?,?,0,?,?);`,
      [username,encPwd,name,email,birth,encCni,addr,encSeed,rDate,rTime]
    );
    await pool.promiseQuery(
      `INSERT INTO users_stock (username,balance,record_date,record_time)
       VALUES (?,?,?,?)`,
      [username,0,rDate,rTime]
    );
    await pool.promiseQuery("COMMIT");

    // Mail de bienvenue
    transporter.sendMail({
      from: process.env.SERV_MAIL,
      to: email,
      subject: "Bienvenue sur OneX",
      html: `<h2>Bienvenue ${name}</h2>
             <p>Votre identifiant : <b>${username}</b>
             <br/>Connectez-vous sous 7 jours pour activer votre compte.</p>`
    });
    // Envoi CNI interne
    transporter.sendMail({
      from: process.env.SERV_MAIL,
      to: "verification@onex.com",
      subject: "Nouvelle inscription – vérif CNI",
      html: `${username}<br>${name}<br>${birth}<br>${addr}`,
      attachments: [
        { filename: "cni1.png", content: cniimg1, encoding: "base64" },
        { filename: "cni2.png", content: cniimg2, encoding: "base64" }
      ]
    });

    res.json({ msg: "ok" });
  } catch (e) {
    await pool.promiseQuery("ROLLBACK").catch(()=>{});
    console.error(e);
    res.json({ msg: "failed" });
  }
}

// — POST /app/signin
async function signin(req, res) {
  const { user, pswd, tkn, recon, seed } = req.body;
  const User = user.replaceAll(" ", "+");
  const Pswd = pswd.replaceAll(" ", "+");
  try {
    const uaValid = verifyUA(req, User, Pswd, tkn);
    // Si nouvel UA, ou reconnexion
    if (!uaValid && recon === "0") {
      return res.json({ msg: "forbidden request", ua: "" });
    }
    // Récupérer pwd & seed encodés
    const rows = await pool.promiseQuery("SELECT password,seed,status,id FROM auths WHERE username=?", [User]);
    if (!rows.length) return res.json({ msg:"error", ua:"" });
    const [encPwd, encSeed, status, id] = [rows[0].password, rows[0].seed, rows[0].status, rows[0].id];
    if (decrypt(encPwd, process.env.DB_PSWD) !== Pswd) {
      return res.json({ msg: "incorrect password", ua: "" });
    }
    if (recon==="1" && decrypt(encSeed, process.env.DB_PSWD)!==seed) {
      return res.json({ msg: "incorrect seed", ua: "" });
    }
    // Générer nouveau token UA
    const newUA = encrypt(req.headers["user-agent"], Pswd + User);
    // Activer compte si première connexion
    if (status === 0) {
      await pool.promiseQuery("UPDATE auths SET status=1 WHERE username=?", [User]);
      // bonus si dans les premiers
      if (id <= FIRST_CLIENTS) {
        const [d, t] = getDate();
        const ref = createTransactionId(ONE_X);
        await pool.promiseQuery(
          `UPDATE users_stock SET balance=? WHERE username=?`, 
          [WELCOME_BONUS, User]
        );
        await pool.promiseQuery(
          `INSERT INTO activities
             (sender,receiver,type,amount,unit_price,fees,reference,record_date,record_time)
           VALUES(?,?,?,?,?,?,?,?,?)`,
          [ONE_X, User, 2, WELCOME_BONUS, 1, 0, ref, d, t]
        );
      }
    }
    res.json({ msg: 1, ua: newUA });
  } catch {
    res.json({ msg: "error", ua: "" });
  }
}

// — POST /app/contact-onex
async function contact(req, res) {
  const { user, pswd, subj, msg, tkn } = req.body;
  const User = user.replaceAll(" ", "+");
  const Pswd = pswd.replaceAll(" ", "+");
  if (!verifyUA(req, User, Pswd, tkn)) {
    return res.json({ status: "incorrect auth or forbidden request" });
  }
  try {
    await transporter.sendMail({
      from: process.env.SERV_MAIL,
      to: process.env.SERV_MAIL,
      subject: subj,
      html: `<b>De</b> ${email} (${User})<br>${msg}`
    });
    res.json({ status: "sent" });
  } catch {
    res.json({ status: "error" });
  }
}

// — POST /app/feed
async function feed(req, res) {
  const { user, pswd, tkn } = req.body;
  const User = user.replaceAll(" ", "+");
  const Pswd = pswd.replaceAll(" ", "+");
  if (!verifyUA(req, User, Pswd, tkn)) {
    return res.json({ feed: "incorrect auth or forbidden request" });
  }
  try {
    const [date] = getDate();
    const notifs = await pool.promiseQuery(
      "SELECT * FROM notifs WHERE record_date=? ORDER BY id DESC", [date]
    );
    res.json({ feed: notifs });
  } catch {
    res.json({ feed: [] });
  }
}

// — POST /app/user-last-stock
async function userLastStock(req, res) {
  const { user, pswd, tkn } = req.body;
  const User = user.replaceAll(" ", "+"), Pswd = pswd.replaceAll(" ", "+");
  if (!verifyUA(req, User, Pswd, tkn)) {
    return res.json({ msg: "incorrect auth or forbidden request" });
  }
  try {
    const lastUPrice = await lastUnitPrice(User);
    const [{ balance }]   = await pool.promiseQuery("SELECT balance FROM users_stock WHERE username=?", [User]);
    const value = new BigNumber(balance).multipliedBy(lastUPrice).toFixed();
    res.json({ msg: value, fees: FEES });
  } catch {
    res.json({ msg: "error" });
  }
}

// Check last appropriate unit price for the user
async function lastUnitPrice(user) {
    let price = 1;

    try {
        if (isActive(user)) {
            const [[{ unit_price } = {}]] = await pool.promiseQuery(
                "SELECT MAX(unit_price) AS unit_price FROM common"
            );
            if (unit_price != null) price = unit_price;
        } else {
            const [[{ unit_price } = {}]] = await pool.promiseQuery(
                "SELECT unit_price FROM activities WHERE username = ? ORDER BY id DESC LIMIT 1",
                [user]
            );
            if (unit_price != null) price = unit_price;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du prix unitaire :", error);
    }

    return price;
}

// Check if user is an active one
async function isActive(user){
    
}

// — POST /app/transactions-history
async function transactionsHistory(req, res) {
  const { user, pswd, days, tkn } = req.body;
  const User = user.replaceAll(" ", "+"), Pswd = pswd.replaceAll(" ", "+");
  if (!verifyUA(req, User, Pswd, tkn)) {
    return res.json({ trans: "incorrect auth or forbidden request" });
  }
  try {
    const [daybefore] = getDate(+days);
    const rows = await pool.promiseQuery(
      `SELECT * FROM activities
        WHERE record_date>=? AND (sender=? OR receiver=?)
        ORDER BY id DESC`,
      [daybefore, User, User]
    );
    res.json({ trans: rows });
  } catch {
    res.json({ trans: "error" });
  }
}

// — POST /app/near-transfer
async function nearTransfer(req, res) {
  const { sender, pswd, dest, amount, tkn } = req.body;
  if (!P2P_ALLOWED) return res.json({ transf: "not yet allowed" });
  const S = sender.replaceAll(" ","+"), P = pswd.replaceAll(" ","+"), D = dest.replaceAll(" ","+");
  if (!verifyUA(req, S, P, tkn)) {
    return res.json({ transf: "incorrect auth or forbidden request" });
  }
  const am = +amount;
  if (am < 10000) return res.json({ warning: "value too low" });
  if (S===D)    return res.json({ transf:"failed" });

  try {
    // Récupérer status expéditeur
    const [{ status:stS }] = await pool.promiseQuery("SELECT status FROM auths WHERE username=?", [S]);
    if (stS<1) throw 0;
    // Récupérer prix courant
    const [{ unit_price:p }] = await pool.promiseQuery("SELECT MAX(unit_price) AS unit_price FROM common", []);
    const Amount = new BigNumber(am).dividedBy(p);
    const fees       = Amount.multipliedBy(FEES).dividedBy(100);
    const minReqBal  = Amount.plus(fees);
    // Check balance sender
    const [{ balance:balS }] = await pool.promiseQuery("SELECT balance FROM users_stock WHERE username=?", [S]);
    if (new BigNumber(balS).lt(minReqBal)) return res.json({ transf:"insufficient balance" });
    // Check dest exists & status
    const [{ status:stD }] = await pool.promiseQuery("SELECT status FROM auths WHERE username=?", [D]);
    if (stD<1) throw 0;
    // Check stock max
    const [{ balance:balD }] = await pool.promiseQuery("SELECT balance FROM users_stock WHERE username=?", [D]);
    if (new BigNumber(balD).plus(Amount).multipliedBy(p).gt(MAX_STOCK_DEFAULT)) {
      return res.json({ transf:"unsupported" });
    }

    // Transaction atomique
    const conn = await pool.promiseQuery("BEGIN");
    const [d, t] = getDate();
    const ref    = createTransactionId(S);
    await pool.promiseQuery(
      `INSERT INTO activities
         (sender,receiver,type,amount,unit_price,fees,reference,record_date,record_time)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [S, D, 1, Amount.toFixed(), p, fees.toFixed(), ref, d, t]
    );
    await pool.promiseQuery(
      `UPDATE users_stock SET balance=balance-?,record_date=?,record_time=? WHERE username=?`,
      [minReqBal.toFixed(), d, t, S]
    );
    await pool.promiseQuery(
      `UPDATE users_stock SET balance=balance+?,record_date=?,record_time=? WHERE username=?`,
      [Amount.toFixed(), d, t, D]
    );
    // Mise à jour common (sharedFees)
    const [{ total_units_price:tp, backed_units:bu }] =
      await pool.promiseQuery("SELECT * FROM common ORDER BY id DESC LIMIT 1", []);
    const sharedFees = fees.multipliedBy(3).div(4);
    const newTP      = new BigNumber(tp).plus(sharedFees);
    const newBU      = new BigNumber(bu).plus(fees);
    const newPrice   = newTP.div(tp).multipliedBy(p);
    await pool.promiseQuery(
      `INSERT INTO common (total_units_price,unit_price,backed_units,record_date,record_time)
       VALUES(?,?,?,?,?)`,
      [newTP.toFixed(), newPrice.toFixed(), newBU.toFixed(), d, t]
    );
    await pool.promiseQuery("COMMIT");
    res.json({ transf: "sent" });
  } catch (e) {
    await pool.promiseQuery("ROLLBACK").catch(()=>{});
    console.error(e);
    res.json({ transf: "failed" });
  }
}

// — POST /app/modify-pin-or-password
async function modifyPwd(req, res) {
  const { user, pswd1, pswd2, tkn } = req.body;
  const U = user.replaceAll(" ","+"), P1=pswd1.replaceAll(" ","+"), P2=pswd2.replaceAll(" ","+");
  if (!verifyUA(req, U, P1, tkn)) return res.json({ auth:"incorrect auth or forbidden request" });

  try {
    await pool.promiseQuery(
      "UPDATE auths SET password=? WHERE username=?",
      [encrypt(P2, process.env.DB_PSWD), U]
    );
    res.json({ auth:"updated" });
  } catch {
    res.json({ auth:"error" });
  }
}

// — POST /app/delete-user
async function deleteUser(req, res) {
  const { user, pswd, tkn } = req.body;
  const U = user.replaceAll(" ","+"), P = pswd.replaceAll(" ","+");
  if (!verifyUA(req, U, P, tkn)) return res.json({ auth:"incorrect auth or forbidden request" });

  try {
    // Valeur du compte
    const [{ unit_price:p }]   = await pool.promiseQuery("SELECT MAX(unit_price) AS p FROM common", []);
    const [{ balance:b }]       = await pool.promiseQuery("SELECT balance FROM users_stock WHERE username=?", [U]);
    if (new BigNumber(b).multipliedBy(p).gt(5000)) {
      return res.json({ auth:"failed, balance > 5000" });
    }
    await pool.promiseQuery("DELETE FROM auths WHERE username=?", [U]);
    res.json({ auth:"deleted" });
  } catch {
    res.json({ auth:"error" });
  }
}

// — POST /app/recover-account
async function recoverAccount(req, res) {
  const { user, seed } = req.body;
  const U = user.replaceAll(" ","+"), S = seed.replaceAll(" ","+");
  try {
    const [{ seed:encSeed }] = await pool.promiseQuery("SELECT seed FROM auths WHERE username=?", [U]);
    if (decrypt(encSeed, process.env.DB_PSWD)!==S) throw 0;
    const newPwd = encrypt("123456", process.env.DB_PSWD);
    await pool.promiseQuery("UPDATE auths SET password=? WHERE username=?", [newPwd, U]);
    res.json({ auth:"updated" });
  } catch {
    res.json({ auth:"incorrect" });
  }
}

// — POST /app/modify-seed
async function modifySeed(req, res) {
  const { user, pswd, seed, tkn } = req.body;
  const U = user.replaceAll(" ","+"), P=pswd.replaceAll(" ","+"), S=seed.replaceAll(" ","+");
  if (!verifyUA(req, U, P, tkn)) return res.json({ auth:"incorrect auth or forbidden request" });

  try {
    await pool.promiseQuery("UPDATE auths SET seed=? WHERE username=?", [
      encrypt(S, process.env.DB_PSWD), U
    ]);
    res.json({ auth:"updated" });
  } catch {
    res.json({ auth:"incorrect" });
  }
}

module.exports = {
  downloadApk, checkAppVersion, signup, signin,
  contact, feed, userLastStock, transactionsHistory,
  nearTransfer, modifyPwd, deleteUser, recoverAccount,
  modifySeed
};
