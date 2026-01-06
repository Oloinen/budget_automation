const { parseCsv } = (typeof module !== 'undefined' && module.exports) ? require('../csv') : { parseCsv: Utilities.parseCsv };


function roundValue(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
