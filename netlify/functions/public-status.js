exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      nodes_online: 4,
      nodes_total: 7,
      services: 12,
      vram_gb: 54,
      hb_age_s: null,
    }),
  };
};
