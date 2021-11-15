const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet("123456789abcdefghijklmnopqrstuvwxyz", 4);

module.exports = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/r/" + nanoid(),
        permanent: false,
      },
    ];
  },
};
