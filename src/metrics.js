const config = require('./config');

// Metrics stored in memory
const requests = {};
const requestMethods = {};

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  requests["TOTAL"] = (requests["TOTAL"] || 0) + 1;
  const method = req.method;
  requestMethods[method] = (requestMethods[method] || 0) + 1;
  next();
}

function activeUserTracker(req, res, next) {
    const userId = req.headers['user-id'];
    const activeUsers = new Map();

    if (userId) {
        // If user is already in the map, clear the existing timeout
        if (activeUsers.has(userId)) {
            clearTimeout(activeUsers.get(userId));
        }

        // Set a new timeout to remove the user after 10 minutes of inactivity
        const timeoutId = setTimeout(() => {
            activeUsers.delete(userId);
        }, 600000);

        // Update the map with the new timeout ID
        activeUsers.set(userId, timeoutId);
    }
    next();
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

  sendMetricToGrafana(metrics);
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
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
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = { requestTracker, activeUserTracker };