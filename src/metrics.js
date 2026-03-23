const config = require('./config');
const os = require('os');

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// Metrics stored in memory
const requests = {};
const requestMethods = {};
const authRequests = {};
const activeUsers = new Map();

// Middleware to track requests
function requestTracker(req, res, next) {
    const endpoint = `[${req.method}] ${req.path}`;
    requests[endpoint] = (requests[endpoint] || 0) + 1;
    requests["TOTAL"] = (requests["TOTAL"] || 0) + 1;

    const method = req.method;
    requestMethods[method] = (requestMethods[method] || 0) + 1;

    // res.on('finish', () => {
    //     if (req.path.includes('/api/auth') && (method === 'POST' || method === 'PUT')) {
    //         if (res.statusCode >= 200 && res.statusCode < 300) {
    //             authRequests['success'] = (authRequests['success'] || 0) + 1;
    //         } else {
    //             authRequests['failure'] = (authRequests['failure'] || 0) + 1;
    //         }
    //     }
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

function trackAuthRequest(result) {
    if (result) {
        authRequests['success'] = (authRequests['success'] || 0) + 1;
    } else {
        authRequests['failure'] = (authRequests['failure'] || 0) + 1;
    }
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

module.exports = { requestTracker, activeUserTracker, trackAuthRequest };