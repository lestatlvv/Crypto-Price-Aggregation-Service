'use strict';

function averagePrice(exchanges) {
  if (!Array.isArray(exchanges) || exchanges.length === 0) {
    return null;
  }

  const sum = exchanges.reduce((total, exchange) => total + exchange.price, 0);
  return Number((sum / exchanges.length).toFixed(8));
}

module.exports = {
  averagePrice
};
