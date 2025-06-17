const moment = require("moment");

function parseDateTime(iso) {
  const d = iso.substr(0,10).replace(/-/g,"");
  const t = iso.substr(11,8).replace(/:/g,"");
  return [ +d, t.replace(/\D/g,"") ];
}

function getDate(offsetDays = 0) {
  const m = moment().utcOffset(3).subtract(offsetDays, "days").toISOString();
  return parseDateTime(m);
}

module.exports = { getDate };
