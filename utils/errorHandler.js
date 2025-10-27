const constants = require("../httpStatusCodes");
const { handlePrismaError } = require("./prismaErrorHandler");

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);

  const response = {
    statusCode,
    success: false,
    title: "",
    message: err.message,
  };

  const prismaHandled = handlePrismaError(err);
  if (prismaHandled) {
    response.title = prismaHandled.title;
    response.message = prismaHandled.message;
  }

  switch (statusCode) {
    case constants.NOT_FOUND:
      response.title = "Not Found";
      break;
    case constants.VALIDATION_ERROR:
      response.title = "Validation Failed";
      break;
    case constants.BAD_REQUEST:
      response.title = "Bad Request";
      break;
    case constants.FORBIDDEN:
      response.title = "Forbidden";
      break;
    case constants.CONFLICT_ERROR:
      response.title = "Conflict";
      break;
    case constants.UNAUTHORIZED:
      response.title = "Unauthorized";
      break;
    case constants.SERVER_ERROR:
    default:
      response.title = "Server Error";
      console.error(err.stack);
      break;
  }

  res.json(response);
};

module.exports = errorHandler;
