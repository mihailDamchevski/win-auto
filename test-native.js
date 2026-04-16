const native = require("./native/win-auto-native/win-auto-native.win32-x64-msvc.node");

async function test() {
  try {
    // Test ping
    console.log("Ping:", native.ping());

    // Configure for Notepad
    native.setAppConfig("C:\\Windows\\System32\\notepad.exe", [
      "Edit",
      "RichEditD2DPT",
    ]);

    // Launch (uses config)
    console.log("Launching Notepad...");
    const pid = await native.launch();
    console.log("Launched PID:", pid);

    // Wait a bit for window to appear
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get windows
    const windows = await native.enumerateWindows(pid);
    console.log("Windows found:", windows.length);

    if (windows.length > 0) {
      console.log("Main window:", windows[0]);

      // Find element (uses config class names)
      const element = await native.findElement(windows[0]);
      console.log("Element found:", element);

      if (element) {
        // Type text
        console.log("Typing text...");
        await native.typeText(element, "Hello from generic automation!");
        console.log("Text typed successfully!");

        // Hover over element
        console.log("Hovering over element...");
        await native.hoverElement(element);
        console.log("Hover completed!");

        // Scroll down
        console.log("Scrolling down...");
        await native.scrollElement(element, "down", 2);
        console.log("Scroll completed!");

        // For drag and drop, we need two elements
        // This is just a demonstration - in real usage you'd find different elements
        console.log("Drag and drop demo (same element for illustration)...");
        await native.dragDrop(element, element);
        console.log("Drag and drop completed!");
      }
    }

    console.log("All automation tests completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
