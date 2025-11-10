const jwt = require("jsonwebtoken");

const validateToken = async (req, res, next) => {
  const authHeader = req.headers.Authorization || req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401);
    throw new Error("Authorization header is missing or malformed");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(404);
    throw new Error("Token is missing!");
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decodedToken?.id;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      res.status(401);
      throw new Error("Token has expired");
    }
    res.status(401);
    throw new Error("Token is invalid");
  }
};

module.exports = validateToken;
