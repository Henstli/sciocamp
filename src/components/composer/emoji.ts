// Výběr emoji podle kategorií (bez knihovny).

export const EMOJI_GROUPS: { name: string; icon: string; items: string[] }[] = [
  {
    name: "Smajlíci",
    icon: "😀",
    items: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🤕 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖".split(" "),
  },
  {
    name: "Gesta",
    icon: "👍",
    items: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🧠 👀 👁️ 🫡 🫶 🙋 🙆 🙅 🤷 🤦 🙇".split(" "),
  },
  {
    name: "Srdce",
    icon: "❤️",
    items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💯 ✅ ❌ ❗ ❓ 💤 💬 💭 🎉 🎊 🏆 🥇 🎯".split(" "),
  },
  {
    name: "Škola",
    icon: "📚",
    items: "📚 📖 📝 ✏️ 🖊️ 📎 📌 📅 🗓️ ⏰ ⌛ 💻 🖥️ 📱 🎧 🎤 🎬 📷 🎨 🧪 🔬 🔭 🧮 📐 📊 📈 🌍 🗺️ 🧭 ⛺ 🎒 🚲 🚆 ✈️ 🏕️ ⛰️ 🏔️ 🌲 🎓 💡".split(" "),
  },
  {
    name: "Jídlo",
    icon: "🍕",
    items: "🍎 🍌 🍉 🍓 🍒 🥑 🥕 🌽 🥨 🥐 🍞 🧀 🥚 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🥗 🍝 🍜 🍣 🍰 🎂 🍪 🍩 🍫 🍿 🍦 ☕ 🍵 🧃 🥤 🧋".split(" "),
  },
  {
    name: "Příroda",
    icon: "🐶",
    items: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦉 🦄 🐝 🦋 🐢 🐍 🐙 🐬 🐳 🦈 🌸 🌻 🌹 🍀 🍁 🌈 ☀️ ⛅ 🌧️ ❄️ ⚡ 🌙".split(" "),
  },
];
