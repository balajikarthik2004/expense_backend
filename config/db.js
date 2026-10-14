const mongoose = require("mongoose");
const ensureDns = require("../utils/ensureDns");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not set — check your .env file");
    }

    // Only an SRV URI needs the resolver; a direct mongodb:// host list goes
    // through the OS resolver and is unaffected.
    if (process.env.MONGO_URI.startsWith("mongodb+srv://")) {
      ensureDns();
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Mongoose 8 handles these automatically, but explicit for clarity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);

    // A DNS failure here is an environment problem, not a bad URI or bad
    // credentials — say so, because the raw message points nowhere useful.
    if (/querySrv|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(error.message)) {
      console.error(
        "   DNS lookup failed. Set DNS_SERVERS in .env to a reachable resolver,\n" +
          "   or switch MONGO_URI to the direct mongodb:// host list for this cluster."
      );
    }

    process.exit(1);
  }
};

module.exports = connectDB;
