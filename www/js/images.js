import {
  $,
  $$,
  append,
  hide,
  htmlToElement,
  show,
} from "./utils.js";

export function getModelTitles(titles) {
  return titles.map((e) => {
    if (e.title) {
      return e.title;
    }
    return (
      (e.vendor || "") +
      " " +
      (e.model || "") +
      " " +
      (e.variant || "")
    ).trim();
  });
}

export function getHelpTextClass(image) {
  const type = image.type;
  const name = image.name;

  if (type.includes("sysupgrade")) {
    return "tr-sysupgrade-help";
  } else if (type.includes("factory") || type === "trx" || type === "chk") {
    return "tr-factory-help";
  } else if (name.includes("initramfs")) {
    return "tr-initramfs-help";
  } else if (
    type.includes("kernel") ||
    type.includes("zimage") ||
    type.includes("uimage")
  ) {
    return "tr-kernel-help";
  } else if (type.includes("root")) {
    return "tr-rootfs-help";
  } else if (type.includes("sdcard")) {
    return "tr-sdcard-help";
  } else if (type.includes("tftp")) {
    return "tr-tftp-help";
  } else if (type.includes(".dtb")) {
    return "tr-dtb-help";
  } else if (type.includes("cpximg")) {
    return "tr-cpximg-help";
  } else if (type.startsWith("eva")) {
    return "tr-eva-help";
  } else if (type.includes("uboot") || type.includes("u-boot")) {
    return "tr-uboot-help";
  }
  return "tr-other-help";
}

export function commonPrefix(array) {
  const A = array.sort();
  const a1 = A[0];
  const a2 = A[A.length - 1];
  let i = 0;
  while (i < a1.length && a1[i] === a2[i]) i++;
  return a1.slice(0, i);
}

export function getNameDifference(images, image) {
  function ar(e) {
    return e.name.split("-");
  }
  const same = images.filter((e) => e.type === image.type);
  if (same.length > 1) {
    const prefix = commonPrefix(same.map((e) => ar(e)));
    const suffix = commonPrefix(same.map((e) => ar(e).reverse()));
    const base = ar(image);
    return base.slice(prefix.length, base.length - suffix.length).join("-");
  }
  return "";
}

function createLink(mobj, image, imageUrl) {
  const href = imageUrl + "/" + image.name;
  let label = image.type;

  const extra = getNameDifference(mobj.images, image);
  if (extra.length > 0) {
    label += ` (${extra})`;
  }

  return htmlToElement(
    `<td><a href="${href}" class="download-link"><span></span>${label.toUpperCase()}</a></td>`
  );
}

function createExtra(image, config) {
  return htmlToElement(
    "<td>" +
      (config.show_help
        ? `<div class="help-content ${getHelpTextClass(image)}"></div>`
        : "") +
      (image.sha256
        ? `<div class="hash-content">sha256sum: ${image.sha256}</div>`
        : "") +
      "</td>"
  );
}

export function sortImages(images) {
  const typePrecedence = ["sysupgrade", "factory"];
  return images.sort((a, b) => {
    const ap = typePrecedence.indexOf(a.type);
    const bp = typePrecedence.indexOf(b.type);
    return ap === -1 ? 1 : bp === -1 ? -1 : ap - bp;
  });
}

export function isAnyDeviceSelected(currentDevice) {
  return Object.keys(currentDevice).length > 0;
}

export function normalizePackageList(list) {
  return Array.isArray(list)
    ? list.filter((pkg) => typeof pkg === "string")
    : [];
}

function getMappedPackagesForDevice(deviceMap, deviceId) {
  if (!deviceId) {
    return [];
  }

  const idsToTry = [deviceId];
  if (deviceId.includes("_")) {
    idsToTry.push(deviceId.replace("_", ","));
  }
  if (deviceId.includes(",")) {
    idsToTry.push(deviceId.replace(",", "_"));
  }

  for (const candidate of idsToTry) {
    if (candidate in deviceMap) {
      const v = deviceMap[candidate];
      return Array.isArray(v) ? v : [];
    }
  }

  return [];
}

export function buildAsuPackages(mobj, config, customDevicePackages) {
  const jsonMap = customDevicePackages || {};
  return normalizePackageList(
    [].concat(
      mobj.default_packages || [],
      mobj.device_packages || [],
      config.asu_extra_packages || [],
      getMappedPackagesForDevice(jsonMap, mobj.id)
    )
  );
}

export function updateImages(version, mobj, context) {
  const { config, currentDevice, customDevicePackages } = context;

  $$("#download-table1 *").forEach((e) => e.remove());

  if (mobj) {
    if ("asu_image_url" in mobj) {
      mobj.image_folder = mobj.asu_image_url;
    } else {
      const baseUrl = config.image_urls[version];
      mobj.image_folder = `${baseUrl}/targets/${mobj.target}`;
    }

    const h3 = $("#downloads1 h3");
    if ("build_cmd" in mobj) {
      h3.classList.remove("tr-downloads");
      h3.classList.add("tr-custom-downloads");
    } else {
      h3.classList.remove("tr-custom-downloads");
      h3.classList.add("tr-downloads");
    }

    mobj.images.sort((a, b) => a.name.localeCompare(b.name));

    const table1 = $("#download-table1");

    for (const image of sortImages(mobj.images)) {
      const link = createLink(mobj, image, mobj.image_folder);
      const extra = createExtra(image, config);

      const row = append(table1, "TR");
      row.appendChild(link);
      row.appendChild(extra);
    }

    hide("#notfound");
    show("#images");
  } else {
    if ($("#models").value.length > 0) {
      show("#notfound");
    } else {
      hide("#notfound");
    }
    hide("#images");
  }
}
