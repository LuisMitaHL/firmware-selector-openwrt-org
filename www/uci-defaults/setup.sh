# Beware! This script will be in /rom/etc/uci-defaults/ as part of the image.
# The actual uci-defaults script is generated dynamically by the web UI.
# This file is kept as a reference template only.
#
# Root password is injected at build time from the web form.
# Wi-Fi SSIDs, encryption, channels, and passwords are also injected.

# SQM configuration is dynamically inserted at INSTERT_SQM_HERE.
# A hotplug script is installed at /etc/hotplug.d/iface/99-sqm-phy-ap
# that watches for new phy*ap* interfaces and reloads SQM if config exists.