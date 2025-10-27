const { Prisma } = require("@prisma/client");

const handlePrismaError = (err) => {
  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      title: "Validation Error",
      message: "Invalid query structure or field selection in Prisma query.",
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    let message = `Prisma known error: ${err.message}`;
    if (err.code === "P2002") {
      message = `Unique constraint failed on field(s): ${err.meta?.target?.join(", ")}`;
    } else if (err.code === "P2025") {
      message = "Record not found or already deleted.";
    }

    return {
      title: "Database Error",
      message,
    };
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      title: "Unknown Database Error",
      message: "An unknown error occurred in the database engine.",
    };
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return {
      title: "Database Initialization Error",
      message: "Could not connect to the database. Check credentials and connection.",
    };
  }

  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return {
      title: "Database Panic",
      message: "The database engine panicked. Please investigate or contact support.",
    };
  }

  return null;
};

module.exports = { handlePrismaError };
