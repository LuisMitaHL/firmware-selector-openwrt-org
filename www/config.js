/* exported config */

var config = {
  // Hardcoded OpenWrt version
  version: "25.12.2",

  // Attended Sysupgrade Server (official instance)
  asu_url: "https://sysupgrade.openwrt.org",

  // Extra packages to include in every build (e.g. custom tools)
  default_packages: [],

  // Supported devices — only these can build firmware
  devices: [
    {
      title: "Cudy TR1200 v1",
      id: "cudy_tr1200-v1",
      target: "ramips/mt76x8",
    },
    {
      title: "Cudy TR3000",
      id: "cudy_tr3000",
      target: "mediatek/filogic",
    },
    {
      title: "Confiabits MT7621 v1",
      id: "confiabits_mt7621-v1",
      target: "ramips/mt7621",
    },
  ],
};