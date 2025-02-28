"use strict";

const SHOW = "SHOW_PRICE";
const UPDATE = "UPDATE_USD_PRICE";

let fs = require('fs');
let EventEmitter = require('events');

function readJsonFromFile(fileName) {
    try {
        let data = fs.readFileSync(fileName, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading or parsing file:", err);
        return { rates: [] };
    }
}

class CurrencyConverter extends EventEmitter {

    static calculateRates(usdPrices) {
        let rates = {};
        let usdMap = {};

        for (let o of usdPrices) {
            let sym = o['asset_id_quote'];
            let usdRate = o['rate'];
            rates[`USD-${sym}`] = usdRate;
            rates[`${sym}-USD`] = 1 / usdRate;
            usdMap[sym] = usdRate;
        }

        let symbols = Object.keys(usdMap);
        for (let from of symbols) {
            for (let to of symbols) {
                if (from !== to) {
                    rates[`${from}-${to}`] = usdMap[to] / usdMap[from];
                }
            }
        }
        return rates;
    }

    constructor(coin2USD) {
        super();
        this.rates = this.constructor.calculateRates(coin2USD.rates);

        this.on(SHOW, (o) => {
            console.log("SHOW event received.");
            const { from, to } = o;
            try {
                let rate = this.convert(1, from, to);
                console.log(`1 ${from} is worth ${rate} ${to}`);
            } catch (e) {
                console.error(e.message);
            }
        });

        this.on(UPDATE, (o) => {
            const { sym, usdPrice } = o;
            if (!sym || !usdPrice || usdPrice <= 0) {
                console.error("Invalid update parameters.");
                return;
            }
            console.log(`Updating ${sym} price to ${usdPrice} USD.`);
            
            this.rates[`USD-${sym}`] = usdPrice;
            this.rates[`${sym}-USD`] = 1 / usdPrice;
            
            const symbols = Object.keys(this.rates)
                .filter(key => key.startsWith('USD-'))
                .map(key => key.split('-')[1]);

            for (let from of symbols) {
                for (let to of symbols) {
                    if (from !== to) {
                        this.rates[`${from}-${to}`] = this.rates[`USD-${to}`] / this.rates[`USD-${from}`];
                    }
                }
            }
            console.log("Rates updated successfully.");
        });
    }

    convert(amount, fromUnits, toUnits) {
        let tag = `${fromUnits}-${toUnits}`;
        let rate = this.rates[tag];
        if (rate === undefined) {
            throw new Error(`Rate for ${tag} not found`);
        }
        return rate * amount;
    }
}

const PATH = './rates.json';

const jsonData = {
    "asset_id_base": "USD",
    "rates": [
      {
        "time": "2019-01-25T23:47:01.6754729Z",
        "asset_id_quote": "LTC",
        "rate": 0.030537365914358224607146457
      },
      {
        "time": "2019-01-25T23:47:01.6754729Z",
        "asset_id_quote": "BTC",
        "rate": 0.0002807956773388707203621601
      },
      {
        "time": "2019-01-25T23:47:01.6754729Z",
        "asset_id_quote": "EOS",
        "rate": 0.4121926588487459038354526906
      },
      {
        "time": "2019-01-25T23:47:01.6754729Z",
        "asset_id_quote": "ETC",
        "rate": 0.2318602151511556498865332176
      },
      {
        "time": "2019-01-25T23:47:01.6754729Z",
        "asset_id_quote": "ETH",
        "rate": 0.0086911948499158260365934815
      },
      {
        "time": "2019-01-25T23:47:01.6754729Z",
        "asset_id_quote": "USDT",
        "rate": 1.0019743231865289462786319379
      }
    ]
};

let cnv = new CurrencyConverter(jsonData);
let cnv = new CurrencyConverter(readJsonFromFile(PATH));

console.log(cnv.rates);
console.log("====================================================================");

function test(amt, from, to) {
    console.log(`${amt} ${from} is worth ${cnv.convert(amt, from, to)} ${to}.`);
}

test(4000, 'ETH', 'BTC');
test(200, 'BTC', 'EOS');

console.log("====================================================================");

cnv.emit(SHOW, { from: "EOS", to: "BTC" });
console.log("====================================================================");
cnv.emit(SHOW, { from: "EOS", to: "ETH" });
console.log("====================================================================");
cnv.emit(SHOW, { from: "ETC", to: "ETH" });
console.log("====================================================================");
cnv.emit(SHOW, { from: "LTC", to: "BTC" });
console.log("====================================================================");
cnv.emit(UPDATE, { sym: "BTC", usdPrice: 50000 });
console.log("====================================================================");
cnv.emit(SHOW, { from: "LTC", to: "BTC" });
 