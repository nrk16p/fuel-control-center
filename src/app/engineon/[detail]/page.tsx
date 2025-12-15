export default async function EngineonDetailPage(props: {
  params: Promise<{ detail: string }> | { detail: string };
}) {
  const { params } = props;
  const resolved = await Promise.resolve(params);

  console.log("🧭 Debug Route Params:", resolved);

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        textAlign: "center",
        marginTop: "10vh",
      }}
    >
      <h1>✅ Dynamic Route is Working!</h1>
      <p>Parameter: <strong>{resolved.detail}</strong></p>

      <a
        href="/engineon"
        style={{
          marginTop: "20px",
          display: "inline-block",
          color: "#0070f3",
          textDecoration: "underline",
        }}
      >
        ← Back to Engineon List
      </a>
    </div>
  );
}
