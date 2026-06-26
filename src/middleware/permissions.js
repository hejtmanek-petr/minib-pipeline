function requireHQ(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function dealerCanAccessProject(user, project) {
  return true;
}

module.exports = { requireHQ, dealerCanAccessProject };
