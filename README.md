# REDesNat Builder

**REDesNat** (Router para Emergencias y Desastres Naturales) es un selector y
generador de firmware para OpenWrt, diseñado para simplificar el despliegue de
routers en situaciones de emergencia. Está construido con HTML, CSS y JavaScript
puro — sin dependencias del lado del servidor.

## Inicio rápido

1. Descarga los archivos y entra al directorio del proyecto
2. Inicia un servidor web estático (por ejemplo `python3 -m http.server`)
3. Abre [http://localhost:8000/www/](http://localhost:8000/www/) en tu navegador

## Despliegue

El sistema es completamente estático. Solo necesitas colocar la carpeta `www/`
en cualquier servidor web estático y configurar los valores en
[`www/config.js`](www/config.js) según tu despliegue.

Ejemplos de servidores estáticos que puedes usar:

- **Python**: `python3 -m http.server`
- **Nginx**: sirviendo la carpeta `www/`
- **Apache**: apuntando el DocumentRoot a `www/`
- **Caddy**, **Lighttpd**, etc.

No se necesita PHP, Node.js ni base de datos.

## Funcionamiento

REDesNat Builder se apoya en el servidor oficial de
[Attended SysUpgrade (ASU)](https://github.com/openwrt/asu) de OpenWrt,
disponible en `https://sysupgrade.openwrt.org`. El flujo es el siguiente:

1. El usuario selecciona su dispositivo y configura las opciones deseadas
   (nombre de red, contraseñas, canales WiFi, velocidades de descarga/subida).
2. La herramienta genera un script `uci-defaults` con toda la configuración
   predefinida (hostname, zona horaria, firewall, WiFi, SQM, WireGuard).
3. Se envía una solicitud al servidor ASU oficial, que construye una imagen de
   OpenWrt personalizada con los paquetes seleccionados.
4. Una vez lista, la imagen se puede descargar e instalar en el router.

### Dispositivos soportados

Actualmente se soportan los siguientes dispositivos, definidos en
[`www/config.js`](www/config.js):

| Dispositivo            | ID                     | Plataforma            |
| ---------------------- | ---------------------- | --------------------- |
| Cudy TR1200 v1         | `cudy_tr1200-v1`       | `ramips/mt76x8`       |
| Cudy TR3000            | `cudy_tr3000`          | `mediatek/filogic`    |
| LaOtraRed Aurora v1    | `confiabits_mt7621-v1` | `ramips/mt7621`       |

### Paquetes incluidos por defecto

Cada compilación incluye automáticamente paquetes esenciales como `firewall4`,
`nftables`, `sqm-scripts`, `hostapd-utils`, `wpad-mbedtls` y los controladores
necesarios para cada dispositivo. La lista completa está en
[`www/config.js`](www/config.js).

## Personalización

### Script uci-defaults

El generador produce un script de `uci-defaults` que se ejecuta en el primer
reinicio del router. Incluye:

- **Nombre del equipo**: `REDesNat-` seguido de los últimos 3 dígitos de la MAC
  Ethernet.
- **Zona horaria**: `America/La Paz` (`-04`).
- **Firewall**: política `ACCEPT` por defecto con `flow_offloading` activado.
- **WiFi**: configuración de SSID, canal, potencia de transmisión (15 dBm) y
  cifrado (WPA2, OWE o red abierta).
- **SQM**: control de tráfico con Cake en WAN y fq_codel en las interfaces
  WiFi, con límites de velocidad configurables desde la interfaz.
- **WireGuard**: interfaz `wg0` creada para conectividad VPN.

### Paquetes extra por dispositivo

Si creas un archivo `www/device_packages.json` (basado en el ejemplo
[`www/device_packages.json.example`](www/device_packages.json.example)), puedes
definir paquetes adicionales que se precarguen al seleccionar cada modelo de
router. El formato es un objeto JSON que mapea IDs de perfil a listas de
paquetes.

### Previsualización de configuración

Antes de compilar, puedes hacer clic en el enlace **"Configuración"** debajo del
botón de compilación para ver el script `uci-defaults` completo que se generará.

## Pruebas

Para ejecutar las pruebas unitarias de JavaScript (requiere Node.js 18+):

```bash
node --test 'tests/js/*.test.js'
```

O usando yarn:

```bash
yarn run test:unit
```

Con cobertura:

```bash
yarn run test:coverage
```

## Licencia

Este proyecto es una adaptación del
[OpenWrt Firmware Selector](https://github.com/openwrt/firmware-selector-openwrt-org)
original. Consulta el archivo [`LICENSE`](LICENSE) para más detalles.
