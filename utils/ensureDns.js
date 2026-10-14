const dns = require("dns");

// Node resolves mongodb+srv:// through its bundled DNS client (c-ares), not
// the OS resolver. On some Windows setups c-ares ends up holding nothing but
// 127.0.0.1, where no DNS server listens, and every SRV lookup dies with
// `querySrv ECONNREFUSED` even though nslookup resolves the same record fine.
// Point the resolver somewhere usable; DNS_SERVERS overrides the defaults for
// networks where the public resolvers are blocked.
const isUsableResolver = (address) =>
  !address.startsWith("127.") && address !== "::1" && address !== "0.0.0.0";

const ensureDns = ({ quiet = false } = {}) => {
  if (dns.getServers().some(isUsableResolver)) return false;

  const fallback = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  dns.setServers(fallback);
  if (!quiet) {
    console.warn(`⚠️  No usable DNS resolver for Node; using ${fallback.join(", ")} for SRV lookups`);
  }
  return true;
};

module.exports = ensureDns;
