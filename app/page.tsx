import { GeneratorForm } from "@/components/GeneratorForm";

export default function Home() {
  return (
    <main className="page">
      <header className="hero">
        <p className="brand">Pixels</p>
        <h1 className="tagline">Game-ready sprites from a prompt.</h1>
        <p className="lede">
          Cursor automation drafts the art. We lock it to a grid and a hard palette so it
          scales clean in engines.
        </p>
      </header>
      <GeneratorForm />
    </main>
  );
}
