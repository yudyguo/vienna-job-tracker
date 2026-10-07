import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import process from "node:process";

const scrypt = promisify(scryptCallback);

async function readHidden() {
  if (!process.stdin.isTTY) {
    let value = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/[\r\n]+$/, "");
  }
  process.stdout.write("Choose an administrator password (input hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      resolve(value);
    };
    process.stdin.on("data", (key) => {
      if (key === "\u0003") {
        process.stdin.setRawMode(false);
        reject(new Error("Cancelled"));
      } else if (key === "\r" || key === "\n") finish();
      else if (key === "\u007f") value = value.slice(0, -1);
      else value += key;
    });
  });
}

if (process.argv.length > 2) throw new Error("For safety, do not pass the password as a command-line argument.");
const password = await readHidden();
if (password.length < 12) throw new Error("Use at least 12 characters.");
const salt = randomBytes(16).toString("hex");
const hash = await scrypt(password, salt, 64);
console.log(`scrypt$${salt}$${Buffer.from(hash).toString("hex")}`);
