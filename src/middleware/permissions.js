function requireHQ(req, res, next) {
  if (!req.user || req.user.role !== 'HQ') {
    return res.status(403).json({ error: 'HQ access required' });
  }
  next();
}

// Returns true if the dealer is allowed to see/edit this project
function dealerCanAccessProject(user, project) {
  if (user.role === 'HQ') return true;
  if (project.dealer_user_id === user.id) return true;

  let countries = [];
  try {
    countries = JSON.parse(user.countries || '[]');
  } catch (e) {
    countries = [];
  }
  if (project.country && countries.includes(project.country)) return true;

  return false;
}

module.exports = { requireHQ, dealerCanAccessProject };
