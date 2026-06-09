import { $, show, hide, showAlert } from "./utils.js";
import { createAsuRequestBuilder } from "./asu.js";
import { updateImages } from "./images.js";

const config = window.config;
const progress = {
  "init": 5,
  "queued": 10,
  "started": 12,
  "container-setup": 15,
  "download-imagebuilder": 20,
  "validate-manifest": 30,
  "unpack-imagebuilder": 40,
  "calculate-packages-hash": 60,
  "building-image": 80,
};

let embedScriptContent = "";

const defaultUciDefaults = `exec >/tmp/setup.log 2>&1

[ "$(uci -q get system.@system[0].zonename)" = "America/La Paz" ] && exit 0

MAC_ETH0=$(cat /sys/class/net/eth0/address)
ULTIMOS3=$(echo "$MAC_ETH0" | awk -F: '{print $(NF-2)$(NF-1)$NF}')
echo "Ultimos 3: $ULTIMOS3"

uci set system.@system[0].hostname="REDesNat-$ULTIMOS3"
uci set system.@system[0].zonename='America/La_Paz'
uci set firewall.@defaults[0].input='ACCEPT'
uci set firewall.@defaults[0].flow_offloading='1'
uci set firewall.@zone[1].input='ACCEPT'
uci set dhcp.lan.leasetime='5m'
uci set dhcp.@dnsmasq[0].rebind_protection='0'
uci commit system
uci commit firewall
uci commit dhcp
/etc/init.d/firewall restart
/etc/init.d/dnsmasq restart
  uci set wireless.@wifi-device[0].disabled='0'
  uci set wireless.@wifi-device[0].country='BO'
  uci set wireless.@wifi-device[0].htmode='HT20'
  uci set wireless.@wifi-device[0].txpower='18'
INSTERT_2GHZ_CHANNEL_HERE
  uci set wireless.@wifi-device[1].disabled='0'
  uci set wireless.@wifi-device[1].country='BO'
INSTERT_5GHZ_CHANNEL_HERE
  uci set wireless.@wifi-device[1].htmode='VHT40'
  uci set wireless.@wifi-device[1].txpower='20'
INSTERT_WIFI_IFACES_HERE
  uci commit wireless
  wifi

INSTERT_SQM_HERE

sleep 20
/etc/init.d/sqm restart

# Create hotplug script for phy*ap* interfaces
cat <<'HOTPLUG' > /etc/hotplug.d/iface/99-sqm-phy-ap
#!/bin/sh

INTERFACE="\${INTERFACE:-\$1}"
[ "\$ACTION" != "ifup" ] && exit 0

logger -t "sqm-hotplug" "Hotplug triggered for interface: \${INTERFACE}"

case "\$INTERFACE" in
  phy*ap*)
    logger -t "sqm-hotplug" "Interface \${INTERFACE} matches phy*ap* pattern, checking SQM config..."
    if uci -q get sqm.@queue[0] > /dev/null 2>&1; then
      logger -t "sqm-hotplug" "SQM config found, reloading SQM for \${INTERFACE}"
      /etc/init.d/sqm reload
      logger -t "sqm-hotplug" "SQM reload completed for \${INTERFACE}"
    else
      logger -t "sqm-hotplug" "No SQM config found, nothing to reload"
    fi
    ;;
  *)
    logger -t "sqm-hotplug" "Interface \${INTERFACE} does not match phy*ap* pattern, ignoring"
    ;;
esac
HOTPLUG
chmod +x /etc/hotplug.d/iface/99-sqm-phy-ap

echo "All done!"`;

// ---- Cookie helpers ----
function getCookie(name) {
  const match = document.cookie.match("(?:^|;\\s*)" + name + "\\s*=\\s*([^;]*)");
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/";
}
// ------------------------

function buildUciDefaults(formValues) {
  const wifiName = formValues.wifiName.trim();
  const encryption = formValues.encryption;
  const channel2Ghz = formValues.channel2Ghz;
  const channel5Ghz = formValues.channel5Ghz;
  const wifiPassword = formValues.wifiPassword;
  const rootPassword = formValues.rootPassword.trim();
  const downloadSpeed = formValues.downloadSpeed || "30720";
  const uploadSpeed = formValues.uploadSpeed || "30720";

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

  // Insert SQM
  uci = uci.replace('INSTERT_SQM_HERE',
    'DL=' + downloadSpeed + '\n' +
    'UL=' + uploadSpeed + '\n' +
    '\n' +
    'while uci -q delete sqm.@queue[0]; do :; done\n' +
    '\n' +
    'WAN_DEVICE=$(uci -q get network.wan.device)\n' +
    '[ -z "$WAN_DEVICE" ] && WAN_DEVICE=$(uci -q get network.wan.ifname)\n' +
    'if [ -n "$WAN_DEVICE" ]; then\n' +
    '  uci add sqm queue\n' +
    '  uci set sqm.@queue[-1].enabled=\'1\'\n' +
    '  uci set sqm.@queue[-1].interface="$WAN_DEVICE"\n' +
    '  uci set sqm.@queue[-1].qdisc=\'cake\'\n' +
    '  uci set sqm.@queue[-1].script=\'piece_of_cake.qos\'\n' +
    '  uci set sqm.@queue[-1].download="$((DL * 95 / 100))"\n' +
    '  uci set sqm.@queue[-1].upload="$((UL * 95 / 100))"\n' +
    '  uci set sqm.@queue[-1].debug_logging=\'0\'\n' +
    '  uci set sqm.@queue[-1].verbosity=\'5\'\n' +
    '  uci set sqm.@queue[-1].linklayer=\'none\'\n' +
    '  uci set sqm.@queue[-1].qdisc_advanced=\'1\'\n' +
    '  uci set sqm.@queue[-1].squash_dscp=\'1\'\n' +
    '  uci set sqm.@queue[-1].squash_ingress=\'1\'\n' +
    '  uci set sqm.@queue[-1].ingress_ecn=\'ECN\'\n' +
    '  uci set sqm.@queue[-1].egress_ecn=\'NOECN\'\n' +
    '  uci set sqm.@queue[-1].qdisc_really_really_advanced=\'1\'\n' +
    '  uci set sqm.@queue[-1].iqdisc_opts=\'dual-dsthost ingress nat\'\n' +
    '  uci set sqm.@queue[-1].eqdisc_opts=\'dual-srchost\'\n' +

    'fi\n' +
    '\n' +
    'DL0=$((DL * 90 / 100))\n' +
    'UL0=$((UL * 90 / 100))\n' +
    '[ "$DL0" -gt 15360 ] && DL0=15360\n' +
    '[ "$UL0" -gt 15360 ] && UL0=15360\n' +
    'uci add sqm queue\n' +
    'uci set sqm.@queue[-1].enabled=\'1\'\n' +
    'uci set sqm.@queue[-1].interface=\'phy0-ap0\'\n' +
    'uci set sqm.@queue[-1].qdisc=\'fq_codel\'\n' +
    'uci set sqm.@queue[-1].script=\'simplest_tbf.qos\'\n' +
    'uci set sqm.@queue[-1].download="$DL0"\n' +
    'uci set sqm.@queue[-1].upload="$UL0"\n' +
    '\n' +
    'DL1=$((DL * 90 / 100))\n' +
    'UL1=$((UL * 90 / 100))\n' +
    '[ "$DL1" -gt 20480 ] && DL1=20480\n' +
    '[ "$UL1" -gt 20480 ] && UL1=20480\n' +
    'uci add sqm queue\n' +
    'uci set sqm.@queue[-1].enabled=\'1\'\n' +
    'uci set sqm.@queue[-1].interface=\'phy1-ap0\'\n' +
    'uci set sqm.@queue[-1].qdisc=\'fq_codel\'\n' +
    'uci set sqm.@queue[-1].script=\'simplest_tbf.qos\'\n' +
    'uci set sqm.@queue[-1].download="$DL1"\n' +
    'uci set sqm.@queue[-1].upload="$UL1"\n' +
    '\n' +
    'uci commit sqm');

  // Insert wifi ifaces depending on encryption mode
  if (encryption === 'wpa2') {
    const key = wifiPassword.trim() || "12345678";
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='psk2'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[0].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[0].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].max_inactivity='120'\n" +
      "  uci set wireless.@wifi-iface[0].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='psk2'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[1].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[1].max_inactivity='120'");
  } else if (encryption === 'wpa2-pmf') {
    const key = wifiPassword.trim() || "12345678";
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='psk2'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[0].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[0].ieee80211w='1'\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[0].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[0].max_inactivity='120'\n" +
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='psk2'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[1].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[1].ieee80211w='1'\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[1].max_inactivity='120'");
  } else if (encryption === 'wpa3') {
    const key = wifiPassword.trim() || "12345678";
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='sae'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[0].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[0].ieee80211w='2'\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[0].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[0].max_inactivity='120'\n" +
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='sae'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[1].key=\"" + key + "\"\n" +
      "  uci set wireless.@wifi-iface[1].ieee80211w='2'\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[1].max_inactivity='120'");
  } else if (encryption === 'owe') {
    // Enhanced Open: OWE + open transition for each radio = 4 ifaces total
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      // 2.4GHz: iface[0] OWE hidden, iface[1] open transition hidden
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='owe'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + " WPA3\"\n" +
      "  uci set wireless.@wifi-iface[0].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[0].ieee80211w='2'\n" +
      "  uci set wireless.@wifi-iface[0].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[0].max_inactivity='120'\n" +
      // transition iface for 2.4GHz
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[1].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].ieee80211w='2'\n" +
      "  uci set wireless.@wifi-iface[1].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[1].max_inactivity='120'\n" +
      // 5GHz: iface[2] OWE hidden, iface[3] open transition hidden
      "  uci set wireless.@wifi-iface[2].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[2].encryption='owe'\n" +
      "  uci set wireless.@wifi-iface[2].ssid=\"" + wifiName + " WPA3\"\n" +
      "  uci set wireless.@wifi-iface[2].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[2].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[2].ieee80211w='2'\n" +
      "  uci set wireless.@wifi-iface[2].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[2].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[2].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[2].max_inactivity='120'\n" +
      // transition iface for 5GHz
      "  uci set wireless.@wifi-iface[3].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[3].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[3].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[3].hidden='1'\n" +
      "  uci set wireless.@wifi-iface[3].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[3].ieee80211w='2'\n" +
      "  uci set wireless.@wifi-iface[3].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[3].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[3].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[3].max_inactivity='120'");
  } else {
    // Open (no encryption)
    uci = uci.replace('INSTERT_WIFI_IFACES_HERE',
      "  uci set wireless.@wifi-iface[0].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[0].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[0].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[0].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[0].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[0].max_inactivity='120'\n" +
      "  uci set wireless.@wifi-iface[1].disabled='0'\n" +
      "  uci set wireless.@wifi-iface[1].encryption='none'\n" +
      "  uci set wireless.@wifi-iface[1].ssid=\"" + wifiName + "\"\n" +
      "  uci set wireless.@wifi-iface[1].dtim_period=\"3\"\n" +
      "  uci set wireless.@wifi-iface[1].isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].bridge_isolate='1'\n" +
      "  uci set wireless.@wifi-iface[1].disassoc_low_ack='0'\n" +
      "  uci set wireless.@wifi-iface[1].max_inactivity='120'");
  }

  // Append the status page embed script at the end
  if (embedScriptContent) {
    uci += "\n\n" + embedScriptContent;
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

// ---- Basic/Advanced mode helpers ----
const BASIC_DEFAULTS = {
  rootPassword: "openwrteslinux",
  encryption: "open",
  wifiPassword: "12345678",
  channel2Ghz: "11",
  channel5Ghz: "149",
  downloadSpeed: "30720",
  uploadSpeed: "30720",
};

function isAdvancedMode() {
  return getCookie("advanced_mode") === "true";
}

function setAdvancedMode(enabled) {
  setCookie("advanced_mode", enabled ? "true" : "false", 365);
}

function updateAdvancedToggleButton(enabled) {
  const btn = document.getElementById("advanced-toggle");
  if (!btn) return;
  const span = btn.querySelector("span");
  if (enabled) {
    span.textContent = "OCULTAR OPCIONES AVANZADAS";
  } else {
    span.textContent = "MOSTRAR OPCIONES AVANZADAS";
  }
}

function toggleAdvancedVisibility(enabled) {
  const advancedFields = document.getElementById("advanced-fields");
  if (!advancedFields) return;
  if (enabled) {
    show(advancedFields);
  } else {
    hide(advancedFields);
  }
}

function applyAdvancedMode() {
  const enabled = isAdvancedMode();
  toggleAdvancedVisibility(enabled);
  updateAdvancedToggleButton(enabled);
}
// --------------------------------------

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

  // Preload the embed.sh script from GitHub for the uci-defaults
  fetch("https://raw.githubusercontent.com/LuisMitaHL/openwrt-pasankalla-status/refs/heads/main/dist/embed.sh")
    .then(function (r) { return r.text(); })
    .then(function (text) { embedScriptContent = text; })
    .catch(function () { console.warn("Failed to load embed.sh"); });

  // Toggle Wi-Fi password field visibility based on encryption
  const encryptionSelect = document.getElementById("wifi-encryption");
  const passwordGroup = document.getElementById("wifi-password-group");
  function togglePasswordField() {
    if (encryptionSelect.value === "wpa2" || encryptionSelect.value === "wpa2-pmf" || encryptionSelect.value === "wpa3") {
      show(passwordGroup);
    } else {
      hide(passwordGroup);
    }
  }
  encryptionSelect.addEventListener("change", togglePasswordField);
  togglePasswordField();

  // ---- Advanced mode toggle ----
  applyAdvancedMode();

  const advancedToggle = document.getElementById("advanced-toggle");
  if (advancedToggle) {
    advancedToggle.addEventListener("click", function (e) {
      e.preventDefault();
      const newEnabled = !isAdvancedMode();
      setAdvancedMode(newEnabled);
      toggleAdvancedVisibility(newEnabled);
      updateAdvancedToggleButton(newEnabled);
    });
  }
  // -----------------------------

  // ---- Debug: show generated uci-defaults ----
  const debugLink = document.getElementById("asu-show-defaults");
  if (debugLink) {
    debugLink.addEventListener("click", function (e) {
      e.preventDefault();

      const wifiName = document.getElementById("wifi-name").value.trim();

      let encryption, wifiPassword, rootPassword, channel2Ghz, channel5Ghz;
      let downloadSpeed, uploadSpeed;

      if (isAdvancedMode()) {
        encryption = document.getElementById("wifi-encryption").value;
        wifiPassword = document.getElementById("wifi-password").value.trim() || "12345678";
        rootPassword = document.getElementById("root-password").value.trim();
        channel2Ghz = document.getElementById("channel-2ghz").value;
        channel5Ghz = document.getElementById("channel-5ghz").value;
        downloadSpeed = document.getElementById("download-speed").value.trim() || "30000";
        uploadSpeed = document.getElementById("upload-speed").value.trim() || "30000";
      } else {
        encryption = BASIC_DEFAULTS.encryption;
        wifiPassword = BASIC_DEFAULTS.wifiPassword;
        rootPassword = BASIC_DEFAULTS.rootPassword;
        channel2Ghz = BASIC_DEFAULTS.channel2Ghz;
        channel5Ghz = BASIC_DEFAULTS.channel5Ghz;
        downloadSpeed = BASIC_DEFAULTS.downloadSpeed;
        uploadSpeed = BASIC_DEFAULTS.uploadSpeed;
      }

      const formValues = {
        wifiName: wifiName,
        encryption: encryption,
        channel2Ghz: channel2Ghz,
        channel5Ghz: channel5Ghz,
        wifiPassword: wifiPassword,
        rootPassword: rootPassword,
        downloadSpeed: downloadSpeed,
        uploadSpeed: uploadSpeed,
      };

      const defaults = buildUciDefaults(formValues);
      const output = document.getElementById("uci-debug-output");
      output.textContent = defaults;
      show(output);
    });
  }
  // --------------------------------------------

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
        bs.querySelector("span").textContent = "El nombre de la red Wi-Fi es requerido";
        show(bs);
        return;
      }

      let encryption, wifiPassword, rootPassword, channel2Ghz, channel5Ghz;
      let downloadSpeed, uploadSpeed;

      if (isAdvancedMode()) {
        // Read values from the form fields
        encryption = document.getElementById("wifi-encryption").value;
        wifiPassword = document.getElementById("wifi-password").value.trim() || "12345678";
        rootPassword = document.getElementById("root-password").value.trim();
        channel2Ghz = document.getElementById("channel-2ghz").value;
        channel5Ghz = document.getElementById("channel-5ghz").value;
        downloadSpeed = document.getElementById("download-speed").value.trim() || "30000";
        uploadSpeed = document.getElementById("upload-speed").value.trim() || "30000";

        if (encryption === "wpa2" || encryption === "wpa2-pmf" || encryption === "wpa3") {
          if (wifiPassword.length < 8) {
            const bs = document.getElementById("asu-buildstatus");
            bs.classList.remove("asu-info");
            bs.classList.add("asu-error");
            bs.querySelector("span").textContent = "La contraseña Wi-Fi debe tener al menos 8 caracteres";
            show(bs);
            return;
          }
        }

        if (!rootPassword) {
          const bs = document.getElementById("asu-buildstatus");
          bs.classList.remove("asu-info");
          bs.classList.add("asu-error");
          bs.querySelector("span").textContent = "La contraseña de administración es requerida";
          show(bs);
          return;
        }
      } else {
        // Use hardcoded defaults
        encryption = BASIC_DEFAULTS.encryption;
        wifiPassword = BASIC_DEFAULTS.wifiPassword;
        rootPassword = BASIC_DEFAULTS.rootPassword;
        channel2Ghz = BASIC_DEFAULTS.channel2Ghz;
        channel5Ghz = BASIC_DEFAULTS.channel5Ghz;
        downloadSpeed = BASIC_DEFAULTS.downloadSpeed;
        uploadSpeed = BASIC_DEFAULTS.uploadSpeed;
      }

      const formValues = {
        wifiName: wifiName,
        encryption: encryption,
        channel2Ghz: channel2Ghz,
        channel5Ghz: channel5Ghz,
        wifiPassword: wifiPassword,
        rootPassword: rootPassword,
        downloadSpeed: downloadSpeed,
        uploadSpeed: uploadSpeed,
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