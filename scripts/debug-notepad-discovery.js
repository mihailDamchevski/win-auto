const native = require("../native/win-auto-native/win-auto-native.win32-x64-msvc.node");

async function main() {
  native.setAppConfig("C:\\Windows\\System32\\notepad.exe", ["Edit", "RichEditD2DPT", "Scintilla"]);
  const pid = await native.launch("C:\\Windows\\System32\\notepad.exe");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const windows = await native.enumerateWindows(pid);
  const debug = native.debugDiscovery(pid);

  console.log("launch pid:", pid);
  console.log("enumerateWindows:", windows);
  console.log("debugDiscovery entries:", debug.length);
  console.log(
    JSON.stringify(
      debug.filter((entry) => entry.matchesTargetPid || entry.processImage.toLowerCase().includes("notepad")),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
