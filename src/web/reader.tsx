import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
const data = window.__LAW_DATA__;
hydrateRoot(document.getElementById("root")!, <BrowserRouter basename={data.base.replace(/\/$/, "") || "/"}><App data={data} /></BrowserRouter>);
