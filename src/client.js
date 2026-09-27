import React, { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

startTransition(() => {
  hydrateRoot(
    document,
    React.createElement(
      StrictMode,
      null,
      React.createElement(StartClient, null)
    )
  );
});
