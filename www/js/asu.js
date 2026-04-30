import { $, $$, hide, show, split } from "./utils.js";

export function createAsuRequestBuilder(context) {
  const { config, progress, ofsVersion, getCurrentDevice, updateImages } =
    context;

  function getOpenwrtBranch(openwrtVersion) {
    const match = String(openwrtVersion || "").match(/^(\d+\.\d+)/);
    return match ? match[1] : String(openwrtVersion || "");
  }

  function resolveAsuRepositories(
    rawRepositories,
    currentDevice,
    openwrtVersion
  ) {
    const repositories = rawRepositories || {};
    const [target = "", subtarget = ""] = String(
      currentDevice?.target || ""
    ).split("/");
    const openwrtBranch = getOpenwrtBranch(openwrtVersion);

    return Object.fromEntries(
      Object.entries(repositories).map(([name, url]) => [
        name,
        String(url)
          .replaceAll("{openwrt_branch}", openwrtBranch)
          .replaceAll("{openwrt_version}", String(openwrtVersion || ""))
          .replaceAll("{target}", target)
          .replaceAll("{subtarget}", subtarget),
      ])
    );
  }

  function showStatus(message, loading, type) {
    const bs = $("#asu-buildstatus");
    switch (type) {
      case "error":
        bs.classList.remove("asu-info");
        bs.classList.add("asu-error");
        show(bs);
        break;
      case "info":
        bs.classList.remove("asu-error");
        bs.classList.add("asu-info");
        show(bs);
        break;
      default:
        hide(bs);
        break;
    }

    let status = "";
    if (loading) {
      status += `<progress style='margin-right: 10px;' max='100' value=${
        progress[message] || ""
      }></progress>`;
    }
    status += `<span>${message}</span>`;
    $("#asu-buildstatus span").innerHTML = status;
  }

  let buildData = null;

  function buildAsuRequest(requestHash, data) {
    // Clear any previous build output
    hide("#asu-log");

    if (data) {
      buildData = data;
    }

    const currentDevice = getCurrentDevice();
    if (!currentDevice || !currentDevice.id) {
      showStatus("No device selected", false, "error");
      return;
    }

    // Get version from config (hardcoded)
    const selectedVersion = config.version || "25.12.2";

    // Get packages from buildData (passed from main.js)
    const packages = buildData ? buildData.packages : [];

    // Get uci-defaults from buildData
    const defaults = buildData ? buildData.defaults : "";

    // Get version_code from buildData
    const version_code = buildData ? buildData.version_code : "";

    const reposMode = config.asu_repositories_mode;
    const repositoriesMode =
      reposMode === "replace" || reposMode === "append" ? reposMode : null;

    const buildBody = {
      profile: currentDevice.id,
      target: currentDevice.target,
      packages: packages,
      defaults: defaults,
      version_code: version_code,
      version: selectedVersion,
      diff_packages: true,
      client: "ofs/" + ofsVersion,
      repositories: resolveAsuRepositories(
        config.asu_repositories,
        currentDevice,
        selectedVersion
      ),
      repository_keys: config.asu_repository_keys || [],
    };

    if (repositoriesMode) {
      buildBody.repositories_mode = repositoriesMode;
    }

    const requestUrl =
      `${config.asu_url}/api/v1/build` + (requestHash ? `/${requestHash}` : "");

    fetch(requestUrl, {
      cache: "no-cache",
      method: requestHash ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestHash ? null : JSON.stringify(buildBody),
    })
      .then((response) => {
        switch (response.status) {
          case 200:
            showStatus("Build successful!", false, "info");
            response.json().then((mobj) => {
              if ("stderr" in mobj) {
                if ($("#asu-stderr")) $("#asu-stderr").innerText = mobj.stderr;
                if ($("#asu-stdout")) $("#asu-stdout").innerText = mobj.stdout;
                show("#asu-log");
              } else {
                hide("#asu-log");
              }
              showStatus("Build successful!", false, "info");
              mobj.id = currentDevice.id;
              mobj.asu_image_url = config.asu_url + "/store/" + mobj.bin_dir;
              updateImages(mobj.version_number, mobj);
            });
            break;
          case 202:
            response.json().then((mobj) => {
              const detail =
                mobj.detail ||
                mobj.imagebuilder_status ||
                "Queued...";
              showStatus(detail, true, "info");
              if (mobj.detail && mobj.queue_position) {
                $(
                  "#asu-buildstatus span"
                ).innerText += ` (${mobj.queue_position})`;
              }
              setTimeout(buildAsuRequest.bind(null, mobj.request_hash), 5000);
            });
            break;
          default:
            response.json().then((mobj) => {
              if ("stderr" in mobj) {
                if ($("#asu-stderr")) $("#asu-stderr").innerText = mobj.stderr;
                if ($("#asu-stdout")) $("#asu-stdout").innerText = mobj.stdout;
                show("#asu-log");
              } else {
                hide("#asu-log");
              }

              if ("detail" in mobj) {
                showStatus(mobj.detail, false, "error");
              } else if (
                "stderr" in mobj &&
                mobj.stderr.includes("images are too big")
              ) {
                showStatus("Build failed: images are too big", false, "error");
              } else {
                showStatus("Build failed", false, "error");
              }
            });
            break;
        }
      })
      .catch((err) => showStatus(err.message, false, "error"));
  }

  return buildAsuRequest;
}