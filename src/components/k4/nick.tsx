// A name as the events app prints it, "Anna «Fox» K.": the nickname between
// guillemets in Syne Tactile, the rest in Syne. The same rule as the app's
// NameText; the string arrives formatted from the app.
const Nick = ({ children }: { children: string }) => {
  const parts = children.split(/(«[^»]*»)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("«") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one fixed string
          <span key={i} className="k4-tactile">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
};

export default Nick;
