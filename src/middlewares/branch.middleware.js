const extractBranchId = (req, res, next) => {
  const branchId = req.query.branchId || req.body?.branchId || req.headers['x-branch-id'];
  
  if (branchId) {
    req.branchId = parseInt(branchId);
  }
  
  next();
};

module.exports = { extractBranchId };
