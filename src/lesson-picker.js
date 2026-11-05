/** One lesson control with folder flyouts. Opening folders never changes practice. */
export class LessonPicker {
    constructor(button, menu, lessons, onSelect) {
        this.button = button;
        this.menu = menu;
        this.lessons = lessons;
        this.folders = new Map();
        for (const group of new Set(lessons.map(lesson => lesson.group))) {
            const folder = document.createElement("button");
            folder.type = "button";
            folder.role = "menuitem";
            folder.dataset.folder = group;
            folder.textContent = group || "Other";
            folder.setAttribute("aria-label", group || "Other");
            folder.setAttribute("aria-haspopup", "menu");
            folder.setAttribute("aria-expanded", "false");
            const panel = document.createElement("div");
            panel.role = "menu";
            panel.id = `lesson-submenu-${this.folders.size}`;
            folder.setAttribute("aria-controls", panel.id);
            panel.className = "lesson-submenu";
            panel.dataset.group = group;
            panel.setAttribute("aria-label", group || "Other");
            panel.hidden = true;
            for (const lesson of lessons.filter(lesson => lesson.group === group)) {
                const item = document.createElement("button");
                item.type = "button";
                item.role = "menuitemradio";
                item.dataset.lessonId = lesson.id;
                item.textContent = lesson.title;
                item.title = lesson.title;
                item.setAttribute("aria-checked", "false");
                item.addEventListener("click", () => { this.close(); onSelect(lesson.id); });
                panel.append(item);
            }
            this.folders.set(group, { folder, panel });
            folder.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") this.showFolder(group); });
            folder.addEventListener("click", () => this.showFolder(group));
            menu.append(folder, panel);
        }
        button.addEventListener("click", () => {
            if (menu.matches(":popover-open")) this.close();
            else this.open(true);
        });
        button.addEventListener("keydown", event => {
            if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
            event.preventDefault();
            this.open(true, event.key === "ArrowUp");
        });
        menu.addEventListener("toggle", event => {
            button.setAttribute("aria-expanded", String(event.newState === "open"));
            if (event.newState === "closed") this.hideFolders();
        });
        menu.addEventListener("keydown", event => this.navigate(event));
        window.addEventListener("resize", () => { if (menu.matches(":popover-open")) this.close(); });
    }

    select(id) {
        const lesson = this.lessons.find(entry => entry.id === id);
        this.button.value = id;
        this.button.dataset.group = lesson.group;
        this.button.querySelector("span").textContent = lesson.title;
        this.button.title = `${lesson.group || "Other"} / ${lesson.title}`;
        for (const item of this.menu.querySelectorAll("[data-lesson-id]")) {
            item.setAttribute("aria-checked", String(item.dataset.lessonId === id));
        }
    }

    hideFolders() {
        for (const { folder, panel } of this.folders.values()) {
            folder.setAttribute("aria-expanded", "false");
            panel.hidden = true;
        }
    }

    showFolder(group, focus = false) {
        this.hideFolders();
        const { folder, panel } = this.folders.get(group);
        folder.setAttribute("aria-expanded", "true");
        panel.hidden = false;
        if (focus) panel.querySelector("button").focus();
    }

    open(focus = false, last = false) {
        this.hideFolders();
        const rect = this.button.getBoundingClientRect();
        const folderWidth = innerWidth <= 600 ? 140 : 180;
        const lessonWidth = Math.min(330, innerWidth - folderWidth - 16);
        this.menu.style.setProperty("--submenu-width", `${lessonWidth}px`);
        this.menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - folderWidth - lessonWidth - 8))}px`;
        this.menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - Math.min(480, innerHeight * 0.7) - 8))}px`;
        if (!this.menu.matches(":popover-open")) this.menu.showPopover();
        if (focus) [...this.folders.values()].at(last ? -1 : 0).folder.focus();
    }

    close() {
        this.menu.hidePopover();
        this.button.focus({ preventScroll: true });
    }

    navigate(event) {
        const item = event.target.closest("button");
        if (!item || event.ctrlKey || event.metaKey || event.altKey) return;
        const panel = item.closest('[role="menu"]');
        const items = [...panel.querySelectorAll("button")].filter(button => button.closest('[role="menu"]') === panel);
        const index = items.indexOf(item);
        const positions = { ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length,
            Home: 0, End: items.length - 1 };
        if (Object.hasOwn(positions, event.key)) {
            event.preventDefault(); items[positions[event.key]].focus();
        } else if (event.key === "ArrowRight" && item.hasAttribute("data-folder")) {
            event.preventDefault(); this.showFolder(item.dataset.folder, true);
        } else if (event.key === "ArrowLeft" && panel !== this.menu) {
            event.preventDefault(); this.hideFolders(); this.folders.get(panel.dataset.group).folder.focus();
        } else if (event.key === "Escape") {
            event.preventDefault(); this.close();
        } else if (event.key === "Tab") {
            this.menu.hidePopover();
        } else if (/^\S$/.test(event.key)) {
            const match = [...items.slice(index + 1), ...items.slice(0, index + 1)]
                .find(button => button.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
            if (match) { event.preventDefault(); match.focus(); }
        }
    }
}
