import { createRoot } from "react-dom/client";

import { BrowserRouter } from "react-router";

import { App } from "./App";
import { api } from "./api";
import type { Bootstrap } from "./types";

const root = createRoot(document.getElementById("root")!);
api<Bootstrap>("/api/session")
  .then((data) => {
    root.render(
      <BrowserRouter>
        <App data={data} />
      </BrowserRouter>,
    );
  })
  .catch((error) =>
    root.render(
      <main className="error-page p-5">
        <h1>原本を読み込めませんでした</h1>
        <p>{error.message}</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </main>,
    ),
  );
