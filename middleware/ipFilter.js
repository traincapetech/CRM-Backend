const allowedIPs = ['122.176.88.105']; // Replace with your office's IP

const ipFilter = (req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (allowedIPs.includes(clientIP)) {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied. Office Wi-Fi only.' });
  }
};

module.exports = ipFilter;
