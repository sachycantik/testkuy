module.exports = {
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb+srv://Vercel-Admin-tempmail:IWaNwMRaVfvLNSk7@tempmail.7vin9l1.mongodb.net/?retryWrites=true&w=majority"
  },

  domains: [
    "noxxyrorr.biz.id"
  ],

  inbox: {
    expirationHours: 24,
    maxEmailsPerInbox: 1000,
    maxInboxPerIP: 50
  },

  admin: {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASS || "noxxy_admin_2026"
  }
};
//
