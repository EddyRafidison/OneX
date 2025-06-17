const { getDate } = require("./dateUtils");
const crypto = require("crypto");

function getUserPrefix(fullname) {
  return fullname.split(/[\s+%20]+/).pop();
}

function createUserSuffix(cni) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ9876543210".split("");
  const ts = new Date();
  const [Y, M, D, h, m, s, ms] = [
    ts.getFullYear(), ts.getMonth()+1, ts.getDate(),
    ts.getHours(), ts.getMinutes(), ts.getSeconds(),
    ts.getMilliseconds()
  ];
  const nums = [D, M, ...((""+Y).split("")), h, m, s, ms].flat();
  const idx = nums.map(n => n % letters.length);
  return idx.slice(0,4).map(i => letters[i]).join("");
}

function createTransactionId(sender) {
  const [date, time] = getDate();
  return crypto.createHash("shake256", { outputLength: 8 })
               .update(sender + date + time).digest("hex");
}

module.exports = { getUserPrefix, createUserSuffix, createTransactionId };
