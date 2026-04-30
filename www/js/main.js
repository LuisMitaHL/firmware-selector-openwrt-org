import { $, show, hide, showAlert } from "./utils.js";
import { initTranslation } from "./translation.js";
import { createAsuRequestBuilder } from "./asu.js";
import { updateImages } from "./images.js";

const config = window.config;
const progress = {
  "tr-init": 5,
  "tr-queued": 10,
  "tr-started": 12,
  "tr-container-setup": 15,
  "tr-download-imagebuilder": 20,
  "tr-validate-manifest": 30,
  "tr-unpack-imagebuilder": 40,
  "tr-calculate-packages-hash": 60,
  "tr-building-image": 80,
};

const defaultUciDefaults = `exec >/tmp/setup.log 2>&1

[ "$(uci -q get system.@system[0].zonename)" = "America/La Paz" ] && exit 0

MAC_ETH0=$(cat /sys/class/net/eth0/address)
ULTIMOS3=$(echo "$MAC_ETH0" | awk -F: '{print $(NF-2)$(NF-1)$NF}')
echo "Ultimos 3: $ULTIMOS3"

uci set system.@system[0].hostname="OpenWrt-$ULTIMOS3"
uci set system.@system[0].zonename='America/La Paz'
uci set system.@system[0].timezone='<-04>4'
uci set firewall.@defaults[0].input='ACCEPT'
uci set firewall.@zone[1].input='ACCEPT'
uci commit system
uci commit firewall
  uci set wireless.@wifi-device[0].disabled='0'
  uci set wireless.@wifi-device[0].country='BO'
  uci set wireless.@wifi-device[0].htmode='HT20'
  uci set wireless.@wifi-device[0].txpower='17'
INSTERT_2GHZ_CHANNEL_HERE
  uci set wireless.@wifi-device[1].disabled='0'
  uci set wireless.@wifi-device[1].country='BO'
INSTERT_5GHZ_CHANNEL_HERE
  uci set wireless.@wifi-device[1].htmode='VHT80'
  uci set wireless.@wifi-device[1].txpower='20'
INSTERT_WIFI_IFACES_HERE
  uci commit wireless
  wifi

echo "All done!"`;

function buildUciDefaults(formValues) {
  const wifiName = formValues.wifiName.trim();
  const encryption = formValues.encryption;
  const channel2Ghz = formValues.channel2Ghz;
  const channel5Ghz = formValues.channel5Ghz;
  const wifiPassword = formValues.wifiPassword;
  const rootPassword = formValues.rootPassword.trim();

  let uci = defaultUciDefaults;

  // Insert root password
  const rootPwLine = "root_password=\"" + rootPassword.replace(/"/g, '\\"') + "\"\n\n" +
    "(echo \"$root_password\"; sleep 1; echo \"$root_password\") | passwd > /dev/null";
  uci = uci.replace('exec >/tmp/setup.log 2>&1',
    'exec >/tmp/setup.log 2>&1\n\n' + rootPwLine);

  // Insert channels
  uci = uci.replace('INSTERT_2GHZ_CHANNEL_HERE',
    '  uci set wireless.@wifi-device[0].channel=\'' + channel2Ghz + '\'');
  uci = uci.replace('INSTERT_5GHZ_CHANNEL_HERE',
    '  uci set wireless.@wifi-device[1].channel=\'' + channel5Ghz + '\'');

  // Insert wifi ifaces depending on encryption mode
  if (encryption === 'wpa2') {
    const key = wifiPassword.trim() || "12345678";
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='psk2'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "-Lento-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[0].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='psk2'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "-Rapido-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[1].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"");
  } else if (encryption === 'owe') {
    // Enhanced Open: OWE + open transition for each radio = 4 ifaces total
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      // 2.4GHz: iface[0] OWE hidden, iface[1] open transition hidden
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='owe'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "-Lento-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[0].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[0].ieee80211w='2'\n" +
      // transition iface for 2.4GHz
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "-Lento-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[1].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].ieee80211w='2'\n" +
      // 5GHz: iface[2] OWE hidden, iface[3] open transition hidden
      "  uci set wireless.@wifi-iface[2].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[2].encryption='owe'\n" +
      "  uci set wireless.@wifi-iface[2].ssid=\"" + wifiName + "-Rapido-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[2].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[2].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[2].ieee80211w='2'\n" +
      // transition iface for 5GHz
      "  uci set wireless.@wifi-iface[3].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[3].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[3].ssid=\"" + wifiName + "-Rapido-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[3].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[3].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[3].ieee80211w='2'");
  } else {
    // Open (no encryption)
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "-Lento-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "-Rapido-$ULTIMOS3\"\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"");
  }

  return uci;
}

let currentDevice = {};
const ofsVersion = "%GIT_VERSION%";

function setCurrentDevice(next) {
  currentDevice = next;
}

function wrapUpdateImages(version, mobj) {
  updateImages(version, mobj, {
    config,
    currentDevice,
    customDevicePackages: {},
  });
}

const buildAsuRequest = createAsuRequestBuilder({
  config,
  progress,
  ofsVersion,
  getCurrentDevice: () => currentDevice,
  updateImages: wrapUpdateImages,
});

function init() {
  // Populate device dropdown
  const deviceSelect = document.getElementById("device");
  for (const dev of config.devices) {
    const opt = document.createElement("option");
    opt.value = dev.title;
    opt.textContent = dev.title;
    opt.dataset.id = dev.id;
    opt.dataset.target = dev.target;
    deviceSelect.appendChild(opt);
  }

  // Update currentDevice when device changes
  deviceSelect.addEventListener("change", function () {
    const opt = this.options[this.selectedIndex];
    setCurrentDevice({
      id: opt.dataset.id,
      target: opt.dataset.target,
    });
  });
  // Trigger initial selection
  deviceSelect.dispatchEvent(new Event("change"));

  // Toggle Wi-Fi password field visibility based on encryption
  const encryptionSelect = document.getElementById("wifi-encryption");
  const passwordGroup = document.getElementById("wifi-password-group");
  function togglePasswordField() {
    if (encryptionSelect.value === "wpa2") {
      show(passwordGroup);
    } else {
      hide(passwordGroup);
    }
  }
  encryptionSelect.addEventListener("change", togglePasswordField);
  togglePasswordField();

  initTranslation();

  const buildButton = document.getElementById("asu-request-build");
  if (buildButton) {
    buildButton.addEventListener("click", function (e) {
      e.preventDefault();

      // Validate inputs
      const wifiName = document.getElementById("wifi-name").value.trim();
      if (!wifiName) {
        const bs = document.getElementById("asu-buildstatus");
        bs.classList.remove("asu-info");
        bs.classList.add("asu-error");
        bs.querySelector("span").textContent = "Wi-Fi name is required";
        show(bs);
        return;
      }

      const encryption = document.getElementById("wifi-encryption").value;
      if (encryption === "wpa2") {
        const wifiPw = document.getElementById("wifi-password").value.trim();
        if (wifiPw.length < 8) {
          const bs = document.getElementById("asu-buildstatus");
          bs.classList.remove("asu-info");
          bs.classList.add("asu-error");
          bs.querySelector("span").textContent = "Wi-Fi password must be at least 8 characters";
          show(bs);
          return;
        }
      }

      const rootPassword = document.getElementById("root-password").value.trim();
      if (!rootPassword) {
        const bs = document.getElementById("asu-buildstatus");
        bs.classList.remove("asu-info");
        bs.classList.add("asu-error");
        bs.querySelector("span").textContent = "Root password is required";
        show(bs);
        return;
      }

      const formValues = {
        wifiName: wifiName,
        encryption: encryption,
        channel2Ghz: document.getElementById("channel-2ghz").value,
        channel5Ghz: document.getElementById("channel-5ghz").value,
        wifiPassword: document.getElementById("wifi-password").value.trim() || "12345678",
        rootPassword: rootPassword,
      };

      const defaults = buildUciDefaults(formValues);
      const packages = config.default_packages || [];

      buildAsuRequest(null, {
        packages,
        defaults,
        version_code: "",
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", init);