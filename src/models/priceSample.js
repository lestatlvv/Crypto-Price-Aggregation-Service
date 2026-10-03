'use strict';

const mongoose = require('mongoose');

const EXCHANGE_ID_ALIASES = {
  okex: 'okx'
};

const exchangePriceSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 }
}, { _id: false });

const qualitySchema = new mongoose.Schema({
  expectedSources: { type: Number, required: true, min: 0 },
  actualSources: { type: Number, required: true, min: 0 }
}, { _id: false });

const priceSampleSchema = new mongoose.Schema({
  pair: { type: String, required: true, trim: true },
  coinId: { type: String, required: true, trim: true },
  price: { type: Number, default: null, min: 0 },
  timestamp: { type: Date, required: true },
  exchanges: { type: [exchangePriceSchema], default: [] },
  quality: { type: qualitySchema, required: true }
}, {
  collection: 'price_samples',
  versionKey: false
});

priceSampleSchema.index({ pair: 1, timestamp: -1 });

function normalizeExchangeId(id) {
  const exchangeId = String(id || '').trim();
  return EXCHANGE_ID_ALIASES[exchangeId] || exchangeId;
}

function createPriceSample({ pair, coinId, price, timestamp, exchanges, expectedSources }) {
  const sourceExchanges = Array.isArray(exchanges) ? exchanges : [];
  const normalizedExchanges = sourceExchanges.map((exchange) => ({
    id: normalizeExchangeId(exchange.id),
    price: exchange.price
  }));

  return {
    _id: new mongoose.Types.ObjectId(),
    pair,
    coinId,
    price,
    timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now()),
    exchanges: normalizedExchanges,
    quality: {
      expectedSources,
      actualSources: normalizedExchanges.length
    }
  };
}

function toLogDocument(sample) {
  return {
    _id: sample._id,
    pair: sample.pair,
    coinId: sample.coinId,
    price: sample.price,
    timestamp: sample.timestamp,
    exchanges: sample.exchanges,
    quality: sample.quality
  };
}

const PriceSample = mongoose.models.PriceSample || mongoose.model('PriceSample', priceSampleSchema);

module.exports = {
  PriceSample,
  createPriceSample,
  toLogDocument,
  normalizeExchangeId
};
