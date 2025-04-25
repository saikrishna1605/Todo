document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const errorMessage = document.getElementById('errorMessage');

    loginBtn.addEventListener('click', () => {
        loginBtn.classList.add('active');
        signupBtn.classList.remove('active');
        loginForm.classList.add('active');
        signupForm.classList.remove('active');
    });

    signupBtn.addEventListener('click', () => {
        signupBtn.classList.add('active');
        loginBtn.classList.remove('active');
        signupForm.classList.add('active');
        loginForm.classList.remove('active');
    });

    function showError(message, isTemporary = false) {
        errorMessage.textContent = message;
        errorMessage.classList.add('active');
        if (isTemporary) {
            setTimeout(() => {
                errorMessage.classList.remove('active');
            }, 5000);
        }
    }

    async function submitWithRetry(url, data, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                showError(`Attempt ${i + 1}/${retries}...`, true);
                
                const response = await fetch(url, {
                    method: 'POST',
                    body: JSON.stringify(data),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000 // 15 seconds timeout
                });

                const result = await response.json();
                
                if (!response.ok) {
                    if (response.status === 503) {
                        throw new Error('Server not ready. Retrying...');
                    }
                    throw new Error(result.error || 'Server error');
                }
                
                return result;
            } catch (error) {
                if (i === retries - 1) throw error;
                const delay = 2000 * (i + 1);
                showError(`${error.message} Retrying in ${delay/1000} seconds...`, true);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Handle login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData);

        try {
            showError('Connecting to server...', true);
            const result = await submitWithRetry('http://localhost:3000/api/login', data);
            localStorage.setItem('token', result.token);
            localStorage.setItem('userName', result.name);
            window.location.href = './index.html';
        } catch (error) {
            showError(`Login failed: ${error.message}`);
        }
    });

    // Handle signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(signupForm);
        const data = Object.fromEntries(formData);

        try {
            showError('Creating account...', true);
            await submitWithRetry('http://localhost:3000/api/signup', data);
            loginBtn.click();
            showError('Registration successful! Please login.', true);
            signupForm.reset();
        } catch (error) {
            showError(`Registration failed: ${error.message}`);
        }
    });
});
