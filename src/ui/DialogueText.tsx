/** Keep forms of address together in narrow dialogue columns. */
export function DialogueText({ children }: { children: string }) {
  return children.split(/(波特|马尔福|德拉科|哈利)/u).map((part, index) =>
    /^(波特|马尔福|德拉科|哈利)$/u.test(part) ? (
      <span className="dialogue-name" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}
