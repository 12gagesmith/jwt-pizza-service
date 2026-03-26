const config = require('./config');
const os = require('os');

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return Number((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Number(memoryUsage.toFixed(2));
}

// Metrics stored in memory
const requests = {};
const requestMethods = {};
const authRequests = {};
const activeUsers = new Map();
let pizzaPurchases = 0;
let pizzaFailedPurchases = 0;
let pizzaRevenue = 0;
const requestLatencies = [];
const pizzaLatencies = [];

// Middleware to track requests
function requestTracker(req, res, next) {
    const endpoint = `[${req.method}] ${req.path}`;
    requests[endpoint] = (requests[endpoint] || 0) + 1;
    requests["TOTAL"] = (requests["TOTAL"] || 0) + 1;

    const method = req.method;
    requestMethods[method] = (requestMethods[method] || 0) + 1;

    // res.on('finish', () => {
    // });
    next();
}

// Middleware to track active users
function activeUserTracker(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        // If user is already in the map, clear the existing timeout
        if (activeUsers.has(authHeader)) {
            clearTimeout(activeUsers.get(authHeader));
        }

        // Set a new timeout to remove the user after 10 minutes of inactivity
        const timeoutId = setTimeout(() => {
            activeUsers.delete(authHeader);
        }, 300000);

        // Update the map with the new timeout ID
        activeUsers.set(authHeader, timeoutId);
    }
    next();
}

// Middleware to track latency
function latencyTracker(req, res, next) {
  const start = process.hrtime.bigint(); // high-resolution time
  const method = req.method;
  const path = req.path;

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1000000; // convert to ms
    if (path.includes('/api/order') && method === 'POST') {
      pizzaLatencies.push(durationMs);
    }
    requestLatencies.push(durationMs);
  });

  next();
}

function trackAuthRequest(result) {
    if (result) {
        authRequests['success'] = (authRequests['success'] || 0) + 1;
    } else {
        authRequests['failure'] = (authRequests['failure'] || 0) + 1;
    }
}

function trackPizzaPurchase(success, price) {
  if (success) {
    pizzaPurchases++;
    pizzaRevenue += price;
  } else {
    pizzaFailedPurchases++;
  }
}

function averageLatency(latencies) {
  if (latencies.length === 0) return 0;
  const total = latencies.reduce((sum, latency) => sum + latency, 0);
  return Number((total / latencies.length).toFixed(2));
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  Object.keys(requests).forEach((endpoint) => {
    metrics.push(createMetric('requests', requests[endpoint], '1', 'sum', 'asInt', { endpoint }));
  });
  Object.keys(requestMethods).forEach((method) => {
    metrics.push(createMetric('requests', requestMethods[method], '1', 'sum', 'asInt', { method }));
  });
  Object.keys(authRequests).forEach((result) => {
    metrics.push(createMetric('authentications', authRequests[result], '1', 'sum', 'asInt', { result }));
  });

  metrics.push(createMetric('active_users', activeUsers.size, '1', 'gauge', 'asInt', {}));

  metrics.push(createMetric('cpu_usage', getCpuUsagePercentage(), '%', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('memory_usage', getMemoryUsagePercentage(), '%', 'gauge', 'asDouble', {}));

  metrics.push(createMetric('pizza_purchases', pizzaPurchases, '1', 'sum', 'asInt', { result: 'Pizza Purchases' }));
  metrics.push(createMetric('pizza_purchases', pizzaFailedPurchases, '1', 'sum', 'asInt', { result: 'Pizza Failures' }));
  metrics.push(createMetric('pizza_revenue', pizzaRevenue, 'BTC', 'sum', 'asDouble', {}));

  metrics.push(createMetric('request_latency', averageLatency(requestLatencies), 'ms', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('pizza_latency', averageLatency(pizzaLatencies), 'ms', 'gauge', 'asDouble', {}));

  sendMetricToGrafana(metrics);
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.metrics.source };
  const sanitizedMetricValue = sanitizeMetricValue(metricValue, valueType);

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: sanitizedMetricValue,
          timeUnixNano: `${BigInt(Date.now()) * 1000000n}`,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sanitizeMetricValue(metricValue, valueType) {
  if (valueType === 'asInt') {
    const value = Number(metricValue);
    return Number.isFinite(value) ? `${Math.trunc(value)}` : '0';
  }

  const value = Number(metricValue);
  return Number.isFinite(value) ? value : 0;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`HTTP status: ${response.status}; body: ${responseText}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = { requestTracker, activeUserTracker, trackAuthRequest, trackPizzaPurchase, latencyTracker };