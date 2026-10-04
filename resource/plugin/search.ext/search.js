class SearchUI {
    constructor() {
        this.currentSearch = '';
        this.isVisible = false;
        this.createSearchBar();
        this.setupEventListeners();
    }

    createSearchBar() {
        this.searchBar = document.createElement('div');
        this.searchBar.id = 'electron-search-bar';
        this.searchBar.innerHTML = `
          <input type="text" id="search-input" placeholder="搜索...">
          <button id="search-prev">上一个</button>
          <button id="search-next">下一个</button>
          <span id="match-count">0/0</span>
          <button id="search-close">×</button>
        `;
        this.searchBar.classList.add('search-bar');
        this.searchBar.style.display = 'none';
        document.body.appendChild(this.searchBar);
    }

    setupEventListeners() {
        const searchInput = this.searchBar.querySelector('#search-input');
        const prevBtn = this.searchBar.querySelector('#search-prev');
        const nextBtn = this.searchBar.querySelector('#search-next');
        const closeBtn = this.searchBar.querySelector('#search-close');

        // Ctrl+F快捷键监听
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                this.toggleSearchBar();
            } else if (e.key === 'Escape' && this.isVisible) {
                e.preventDefault();
                this.hideSearchBar();
            }
        });

        searchInput.addEventListener('input', (e) => {
            this.currentSearch = e.target.value;
            this.highlightMatches(this.currentSearch);
        });

        prevBtn.addEventListener('click', () => {
            this.navigateToMatch(false);
        });

        nextBtn.addEventListener('click', () => {
            this.navigateToMatch(true);
        });

        closeBtn.addEventListener('click', () => {
            this.hideSearchBar();
        });
    }

    toggleSearchBar() {
        if (this.isVisible) {
            this.hideSearchBar();
        } else {
            this.showSearchBar();
        }
    }

    showSearchBar() {
        this.searchBar.style.display = 'flex';
        this.searchBar.querySelector('#search-input').focus();
        this.isVisible = true;

        if (this.currentSearch) {
            this.highlightMatches(this.currentSearch);
        }
    }

    hideSearchBar() {
        this.searchBar.style.display = 'none';
        this.clearHighlights();
        this.searchBar.querySelector('#search-input').value = '';
        this.updateMatchCount(0, 0);
        this.isVisible = false;
    }

    highlightMatches(searchText) {
        this.clearHighlights();

        if (!searchText) {
            this.updateMatchCount(0, 0);
            return;
        }

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    return node.parentNode.id === 'search-input' ?
                        NodeFilter.FILTER_REJECT :
                        NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let matchCount = 0;
        const textNodes = [];

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const matches = [...node.nodeValue.matchAll(regex)];
            if (matches.length > 0) {
                textNodes.push({ node, matches });
                matchCount += matches.length;
            }
        }

        textNodes.forEach(({ node, matches }) => {
            let lastIndex = 0;
            const parent = node.parentNode;
            const docFrag = document.createDocumentFragment();

            matches.forEach((match) => {
                const prefix = node.nodeValue.slice(lastIndex, match.index);
                const highlight = document.createElement('span');
                highlight.className = 'search-highlight';
                highlight.textContent = match[0];

                docFrag.appendChild(document.createTextNode(prefix));
                docFrag.appendChild(highlight);
                lastIndex = match.index + match[0].length;
            });

            docFrag.appendChild(
                document.createTextNode(node.nodeValue.slice(lastIndex))
            );

            parent.replaceChild(docFrag, node);
        });

        this.updateMatchCount(matchCount, matchCount > 0 ? 1 : 0);

        if (matchCount > 0) {
            this.scrollToHighlight(0);
        }
    }

    clearHighlights() {
        document.querySelectorAll('.search-highlight').forEach(hl => {
            const parent = hl.parentNode;
            const text = document.createTextNode(hl.textContent);
            parent.replaceChild(text, hl);
            parent.normalize();
        });
    }

    navigateToMatch(forward = true) {
        const highlights = document.querySelectorAll('.search-highlight');
        if (highlights.length === 0) return;

        let currentActive = -1;

        highlights.forEach((hl, index) => {
            if (hl.classList.contains('active')) {
                hl.classList.remove('active');
                currentActive = index;
            }
        });

        let nextIndex = forward
            ? (currentActive + 1) % highlights.length
            : (currentActive - 1 + highlights.length) % highlights.length;

        if (currentActive === -1) {
            nextIndex = forward ? 0 : highlights.length - 1;
        }

        highlights[nextIndex].classList.add('active');
        this.updateMatchCount(highlights.length, nextIndex + 1);
        this.scrollToHighlight(nextIndex);
    }

    scrollToHighlight(index) {
        const highlights = document.querySelectorAll('.search-highlight');
        if (highlights.length > index) {
            highlights[index].scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    updateMatchCount(total, current) {
        const matchCount = this.searchBar.querySelector('#match-count');
        matchCount.textContent = `${current}/${total}`;
    }
}

function __initializeSearchUI() {
    new SearchUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __initializeSearchUI);
} else {
    __initializeSearchUI();
}