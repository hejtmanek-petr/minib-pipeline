function requireHQ(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Reports and Country Reports are hidden from mea_sales in the UI; this
// enforces the same restriction on the API itself.
function requireNonSales(req, res, next) {
  if (!req.user || req.user.role === 'mea_sales') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

function dealerCanAccessProject(user, project) {
  return true;
}

module.exports = { requireHQ, requireNonSales, dealerCanAccessProject };
