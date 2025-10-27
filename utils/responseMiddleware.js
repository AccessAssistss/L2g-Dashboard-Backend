const responseMiddleware = (req, res, next) => {
  res.respond = (statusCode, message = "Success", data = null) => {
    const apiResponse = {
      statusCode,
      success: statusCode < 400,
      message,
      data,
    };

    res.status(statusCode).json(apiResponse);
  };

  next();
};

module.exports = responseMiddleware;
