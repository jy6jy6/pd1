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

    // Create spot price map (symbol -> bid and ask prices)
    // Spot symbols are like "BTCUSDT"
    const spotMap = new Map();
    spotData.forEach(item => {
      spotMap.set(item.symbol, {
        bidPrice: parseFloat(item.bidPrice),
        bidQty: parseFloat(item.bidQty),
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
        const perpAsk = parseFloat(perp.ask1);
        const spotBid = spot.bidPrice;
        const spotAsk = spot.askPrice;

        // Only process if all prices are valid and greater than 0
        if (perpBid > 0 && perpAsk > 0 && spotBid > 0 && spotAsk > 0) {
          comparisons.push({
            symbol: spotSymbol,
            perpSymbol: perpSymbol,
            // Spot prices
            spotBid: spotBid,
            spotAsk: spotAsk,
            spotBidQty: spot.bidQty,
            spotAskQty: spot.askQty,
            // Perp prices
            perpBid: perpBid,
            perpAsk: perpAsk,
            perpBidQty: parseFloat(perp.bidQty1 || 0),
            perpAskQty: parseFloat(perp.askQty1 || 0),
            // Additional info
            volume24h: parseFloat(perp.volume24 || 0),
            lastPrice: parseFloat(perp.lastPrice || 0)
          });
        }
      }
    });

    // Return results (frontend will calculate spreads based on selected mode)
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
