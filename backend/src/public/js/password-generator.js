document.addEventListener("DOMContentLoaded", () => {

    const PASSWORD_LENGTH = 20;

    const passwordField = document.getElementById("portalPassword");
    const generateButton = document.getElementById("generatePassword");
    const copyButton = document.getElementById("copyPassword");

    if (!passwordField || !generateButton || !copyButton) {
        return;
    }

    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()-_=+[]{}";

    const allCharacters = upper + lower + numbers + symbols;

    function getRandomCharacter(characters) {

        const random = new Uint32Array(1);
        crypto.getRandomValues(random);

        return characters[random[0] % characters.length];

    }

    function shuffle(array) {

        for (let i = array.length - 1; i > 0; i--) {

            const random = new Uint32Array(1);
            crypto.getRandomValues(random);

            const j = random[0] % (i + 1);

            [array[i], array[j]] = [array[j], array[i]];

        }

        return array;

    }

    function generatePassword(length = PASSWORD_LENGTH) {

        const password = [];

        password.push(getRandomCharacter(upper));
        password.push(getRandomCharacter(lower));
        password.push(getRandomCharacter(numbers));
        password.push(getRandomCharacter(symbols));

        while (password.length < length) {
            password.push(getRandomCharacter(allCharacters));
        }

        return shuffle(password).join("");

    }

    generateButton.addEventListener("click", () => {

        passwordField.disabled = false;
        passwordField.value = generatePassword();

    });

    copyButton.addEventListener("click", async () => {

        if (!passwordField.value) {
            return;
        }

        try {

            // Moderne Browser (HTTPS / localhost)

            if (navigator.clipboard && window.isSecureContext) {

                await navigator.clipboard.writeText(passwordField.value);

            } else {

                // Fallback für HTTP oder ältere Browser

                passwordField.select();
                passwordField.setSelectionRange(0, 99999);

                document.execCommand("copy");

                window.getSelection().removeAllRanges();

            }

            const originalHtml = copyButton.innerHTML;

            copyButton.innerHTML =
                '<i class="bi bi-check-lg me-1"></i>Kopiert';

            setTimeout(() => {

                copyButton.innerHTML = originalHtml;

            }, 2000);

        } catch (err) {

            console.error(err);
            alert("Das Passwort konnte nicht in die Zwischenablage kopiert werden.");

        }

    });

});