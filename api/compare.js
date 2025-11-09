export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Fetch spot prices (best ask prices)
    const spotResponse = await fetch('https://api.mexc.com/api/v3/ticker/bookTicker');
    if (!spotResponse.ok) {
      throw new Error(`Spot API error: ${spotResponse.status}`);
    }
    const spotData = await spotResponse.json();

    // Fetch perpetual prices (best bid prices)
    const perpResponse = await fetch('https://contract.mexc.com/api/v1/contract/ticker');
    if (!perpResponse.ok) {
      throw new Error(`Perpetual API error: ${perpResponse.status}`);
    }
    const perpResponseData = await perpResponse.json();
    const perpData = perpResponseData.data || [];

    // Create spot price map (symbol -> askPrice)
    // Spot symbols are like "BTCUSDT"
    const spotMap = new Map();
    spotData.forEach(item => {
      spotMap.set(item.symbol, {
        askPrice: parseFloat(item.askPrice),
        askQty: parseFloat(item.askQty)
      });
    });

    // Process perpetual contracts and match with spot
    // Perpetual symbols are like "BTC_USDT"
    const comparisons = [];

    perpData.forEach(perp => {
      // Convert perpetual symbol format to spot format
      // "BTC_USDT" -> "BTCUSDT"
      const perpSymbol = perp.symbol;
      const spotSymbol = perpSymbol.replace('_', '');

      // Check if this symbol exists in spot market
      if (spotMap.has(spotSymbol)) {
        const spot = spotMap.get(spotSymbol);
        const perpBid = parseFloat(perp.bid1);
        const spotAsk = spot.askPrice;

        // Only process if both prices are valid and greater than 0
        if (perpBid > 0 && spotAsk > 0) {
          // Calculate spread using the formula:
          // |perp best bid - spot best ask| / ((perp best bid + spot best ask) / 2)
          const difference = perpBid - spotAsk;
          const average = (perpBid + spotAsk) / 2;
          const spreadPercent = (Math.abs(difference) / average) * 100;

          comparisons.push({
            symbol: spotSymbol,
            perpSymbol: perpSymbol,
            spotAsk: spotAsk,
            perpBid: perpBid,
            difference: difference,
            spreadPercent: spreadPercent,
            // Additional info
            spotAskQty: spot.askQty,
            perpBidQty: parseFloat(perp.bidQty1 || 0),
            volume24h: parseFloat(perp.volume24 || 0),
            lastPrice: parseFloat(perp.lastPrice || 0)
          });
        }
      }
    });

    // Sort by spread percentage (highest first)
    comparisons.sort((a, b) => b.spreadPercent - a.spreadPercent);

    // Return results
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      totalPairs: comparisons.length,
      data: comparisons
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
