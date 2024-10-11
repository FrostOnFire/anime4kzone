// script.js

const SERVER_URL = 'http://203.0.113.10:9090';
const suggestions = document.getElementById('suggestions');
const titleInput = document.getElementById('title-input');
const episodeInput = document.getElementById('episode-input');
const chronologyInput = document.getElementById('chronology-input');
const descriptionInput = document.getElementById('description-input');
const franchiseInput = document.getElementById('franchise-input');
const voiceoverSelect = document.getElementById('voiceover-select');
const coverImage = document.getElementById('cover-image');
const dropzoneElement = document.getElementById('video-dropzone');
const genresElement = document.getElementById('genres');
const ratingElement = document.getElementById('rating');  
const totalEpisodesElement = document.getElementById('total-episodes');  
const openingStartMinutes = document.getElementById('opening-start-minutes');
const openingStartSeconds = document.getElementById('opening-start-seconds');
const openingEndMinutes = document.getElementById('opening-end-minutes');
const openingEndSeconds = document.getElementById('opening-end-seconds');
const submitBtn = document.getElementById('submit-btn');
const logElement = document.getElementById('log');
const errorElement = document.getElementById('error');
const queueStatusElement = document.getElementById('queue-status');
const coverLoadingElement = document.getElementById('cover-loading'); // Элемент для индикатора загрузки

// Переменная для хранения обложки
let coverFile = null;
let currentCoverAbortController = null; // Для отмены предыдущего запроса

episodeInput.disabled = true;
chronologyInput.disabled = true;
descriptionInput.disabled = true;
franchiseInput.disabled = true;
openingStartMinutes.disabled = true;
openingStartSeconds.disabled = true;
openingEndMinutes.disabled = true;
openingEndSeconds.disabled = true;
voiceoverSelect.disabled = true;

// Удаляет ненужные теги из текста
function removeCharacterTags(text) {
    return text
        .replace(/\[.*?\]/g, '')  // Удалить содержимое в квадратных скобках
        .replace(/[\[\]]/g, '')   // Удалить оставшиеся [ и ]
        .replace(/\s+([,.!?])/g, '$1')  // Удалить пробел перед пунктуацией
        .trim();
}

// Очищает данные франшизы
function cleanFranchiseData(franchiseDetails) {
    return franchiseDetails.nodes ? franchiseDetails.nodes.map(anime => ({
        id: anime.id,
        title: anime.name,
        date: anime.date
    })) : [];
}

// Получает название франшизы или использует fallback
function getFranchiseTitle(sortedFranchise, fallbackTitle) {
    return sortedFranchise.length > 0 ? sortedFranchise[0].title : fallbackTitle;  
}

// Получает номер хроники
function getChronologyNumber(sortedFranchise, selectedAnimeId) {
    return sortedFranchise.length > 0 ? sortedFranchise.findIndex(anime => anime.id === selectedAnimeId) + 1 : 1;  
}

// Обработчик ввода для поля названия
titleInput.addEventListener('input', function () {
    const query = this.value;

    if (query.length >= 3) {
        fetch(`https://shikimori.one/api/animes?search=${encodeURIComponent(query)}&limit=10&page=1`)
            .then(response => response.json())
            .then(data => {
                suggestions.innerHTML = '';
                suggestions.style.display = 'block';

                data.forEach(anime => {
                    const suggestionItem = document.createElement('li');
                    suggestionItem.textContent = anime.russian;
                    suggestionItem.addEventListener('click', function () {
                        // При выборе нового аниме, сбрасываем предыдущие данные
                        resetCover();

                        titleInput.value = anime.russian;
                        suggestions.style.display = 'none';

                        document.getElementById('anime-id').value = anime.id;
                        document.getElementById('anime-title').value = anime.russian;
                        document.getElementById('anime-cover').value = anime.image.original;

                        fetch(`https://shikimori.one/api/animes/${anime.id}`)
                            .then(response => response.json())
                            .then(details => {
                                if (Array.isArray(details.genres)) {
                                    const genreNames = details.genres.map(g => g.russian).join(', ');
                                    genresElement.textContent = genreNames;  
                                } else {
                                    genresElement.textContent = '';  
                                }

                                const totalEpisodes = details.episodes || 'N/A';
                                totalEpisodesElement.textContent = totalEpisodes;  

                                episodeInput.disabled = false;
                                episodeInput.max = totalEpisodes;
                                episodeInput.placeholder = `Enter episode number (1-${totalEpisodes})`;

                                if (details.description) {
                                    descriptionInput.value = removeCharacterTags(details.description);
                                }
                                descriptionInput.disabled = false;

                                ratingElement.textContent = details.score ? details.score : 'N/A';  

                                fetch(`https://shikimori.one/api/animes/${anime.id}/franchise`)
                                    .then(response => response.json())
                                    .then(franchiseDetails => {
                                        const sortedFranchise = cleanFranchiseData(franchiseDetails).sort((a, b) => a.date - b.date);

                                        const franchiseTitle = getFranchiseTitle(sortedFranchise, anime.russian);
                                        franchiseInput.value = franchiseTitle;
                                        franchiseInput.disabled = false;

                                        const chronologyNumber = getChronologyNumber(sortedFranchise, anime.id);
                                        chronologyInput.value = chronologyNumber;
                                        chronologyInput.disabled = false;
                                    })
                                    .catch(error => {
                                        franchiseInput.value = anime.russian;
                                        chronologyInput.value = 1;
                                        chronologyInput.disabled = false;
                                        console.error('Error fetching franchise:', error);
                                    });

                                voiceoverSelect.disabled = false;
                                checkFormValidity();
                            });

                        // Устанавливаем URL обложки через прокси-эндпоинт
                        const coverUrl = `https://shikimori.one${anime.image.original}`;
                        const proxyCoverUrl = `${SERVER_URL}/proxy-cover?url=${encodeURIComponent(coverUrl)}`;

                        coverImage.src = proxyCoverUrl;
                        coverImage.style.display = 'block';

                        dropzoneElement.classList.remove('disabled');

                        openingStartMinutes.disabled = false;
                        openingStartSeconds.disabled = false;

                        openingStartMinutes.addEventListener('input', function() {
                            calculateOpeningEnd();
                            checkFormValidity();
                        });
                        openingStartSeconds.addEventListener('input', function() {
                            calculateOpeningEnd();
                            checkFormValidity();
                        });

                        // Автоматическая загрузка обложки через прокси
                        downloadCoverImage(coverUrl);
                        checkFormValidity();
                    });
                    suggestions.appendChild(suggestionItem);
                });
            })
            .catch(error => console.error('Error fetching suggestions:', error));
    } else {
        suggestions.style.display = 'none';
    }
});

// Функция для сброса предыдущей обложки
function resetCover() {
    // Отмена предыдущего запроса, если он существует
    if (currentCoverAbortController) {
        currentCoverAbortController.abort();
        currentCoverAbortController = null;
    }

    // Сброс переменной coverFile
    coverFile = null;

    // Скрытие обложки в UI
    coverImage.src = '';
    coverImage.style.display = 'none';

    // Скрытие индикатора загрузки, если он существует
    if (coverLoadingElement) {
        coverLoadingElement.style.display = 'none';
    }
}

// Функция для скачивания обложки через прокси и преобразования её в файл
function downloadCoverImage(url) {
    // Показываем индикатор загрузки
    if (coverLoadingElement) {
        coverLoadingElement.style.display = 'block';
    }

    // Если уже идет загрузка, отменяем её
    if (currentCoverAbortController) {
        currentCoverAbortController.abort();
    }

    currentCoverAbortController = new AbortController();
    const signal = currentCoverAbortController.signal;

    // Используем прокси-эндпоинт вашего сервера
    const proxyUrl = `${SERVER_URL}/proxy-cover?url=${encodeURIComponent(url)}`;

    fetch(proxyUrl, { signal })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const filename = url.split('/').pop().split('?')[0] || 'cover.jpg';
            coverFile = new File([blob], filename, { type: blob.type });
            console.log(`Cover image size: ${coverFile.size} bytes`);
            // Вы можете также отобразить размер в интерфейсе, если необходимо
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                console.log('Previous cover image download aborted.');
            } else {
                console.error('Error downloading cover image:', error);
            }
        })
        .finally(() => {
            currentCoverAbortController = null;
            // Скрываем индикатор загрузки
            if (coverLoadingElement) {
                coverLoadingElement.style.display = 'none';
            }
        });
}

// Функция для расчёта конца открытия
function calculateOpeningEnd() {
    const startMinutes = parseInt(openingStartMinutes.value) || 0;
    const startSeconds = parseInt(openingStartSeconds.value) || 0;
    const totalStartSeconds = startMinutes * 60 + startSeconds;

    const totalEndSeconds = totalStartSeconds + 90;

    const endMinutes = Math.floor(totalEndSeconds / 60);
    const endSeconds = totalEndSeconds % 60;

    openingEndMinutes.value = endMinutes;
    openingEndSeconds.value = endSeconds;
    openingEndMinutes.disabled = false;
    openingEndSeconds.disabled = false;
    checkFormValidity();
}

// Функция для проверки валидности формы
function checkFormValidity() {
    const isTitleFilled = titleInput.value.trim() !== '';
    const isEpisodeFilled = episodeInput.value.trim() !== '';
    const isChronologyFilled = chronologyInput.value.trim() !== '';
    const isFranchiseFilled = franchiseInput.value.trim() !== '';
    const isOpeningStartMinutesFilled = openingStartMinutes.value.trim() !== '';
    const isOpeningStartSecondsFilled = openingStartSeconds.value.trim() !== '';
    const isOpeningEndMinutesFilled = openingEndMinutes.value.trim() !== '';
    const isOpeningEndSecondsFilled = openingEndSeconds.value.trim() !== '';
    const isVoiceoverSelected = voiceoverSelect.value !== '';
    const isVideoUploaded = Dropzone.forElement("#video-dropzone").getAcceptedFiles().length > 0;
  
    if (
      isTitleFilled &&
      isEpisodeFilled &&
      isChronologyFilled &&
      isFranchiseFilled &&
      isOpeningStartMinutesFilled &&
      isOpeningStartSecondsFilled &&
      isOpeningEndMinutesFilled &&
      isOpeningEndSecondsFilled &&
      isVoiceoverSelected &&
      isVideoUploaded
    ) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
}

// Настройка Dropzone для загрузки видео
Dropzone.options.videoDropzone = {
    url: `${SERVER_URL}/upload`,
    maxFilesize: 3072, // 3 GB
    acceptedFiles: ".mp4,.avi,.mov",
    autoProcessQueue: false,
    maxFiles: 1,
    addRemoveLinks: true,
    timeout: 3600000, // 1 час
    init: function () {
        const myDropzone = this;

        // Обработчик клика по кнопке отправки
        submitBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (myDropzone.getQueuedFiles().length > 0) {
                myDropzone.processQueue();
            } else {
                errorElement.textContent = "Please add a video before submitting.";
            }
        });

        // Обработчик добавления файла
        this.on("addedfile", function (file) {
            console.log('File added:', file.name);
            checkFormValidity();
        });

        // Обработчик удаления файла
        this.on("removedfile", function (file) {
            console.log('File removed:', file.name);
            checkFormValidity();
        });

        // Обработчик отправки файла
        this.on("sending", function (file, xhr, formData) {
            formData.append("anime_id", document.getElementById('anime-id').value);
            formData.append("anime_title", document.getElementById('anime-title').value);
            formData.append("anime_cover", document.getElementById('anime-cover').value);
            formData.append("anime_genre", genresElement.textContent);
            formData.append("episode", episodeInput.value);
            formData.append("chronology", chronologyInput.value);
            formData.append("description", descriptionInput.value);
            formData.append("voiceover", voiceoverSelect.value);
            formData.append("franchise", franchiseInput.value); // Добавлено поле franchise

            const openingStartTime = parseInt(openingStartMinutes.value) * 60 + parseInt(openingStartSeconds.value);
            const openingEndTime = parseInt(openingEndMinutes.value) * 60 + parseInt(openingEndSeconds.value);
            formData.append("opening_start", openingStartTime);
            formData.append("opening_end", openingEndTime);

            // Добавляем файл обложки, если он существует
            if (coverFile) {
                formData.append("cover_file", coverFile);
                console.log(`Cover file size: ${coverFile.size} bytes`);
            }
        });

        // Обработчик успешной загрузки
        this.on("success", function (file, response) {
            logElement.textContent = response.message || "Video uploaded successfully!";
            myDropzone.removeFile(file);
            resetForm();
        });

        // Обработчик ошибок загрузки
        this.on("error", function (file, response) {
            console.error('Error uploading file:', response);
            let message = '';
        
            if (typeof response === 'string') {
                message = response;
            } else if (response && response.message) {
                message = response.message;
            } else if (response && response.error) {
                message = response.error;
            } else {
                message = 'Unknown error occurred during upload.';
            }
        
            errorElement.textContent = `Error uploading video: ${message}`;
        });
    }
};

// Функция для сброса формы
function resetForm() {
    titleInput.value = '';
    episodeInput.value = '';
    voiceoverSelect.value = '';
    openingStartMinutes.value = '';
    openingStartSeconds.value = '';
    openingEndMinutes.value = '';
    openingEndSeconds.value = '';
    descriptionInput.value = '';
    franchiseInput.value = '';
    chronologyInput.value = '';
    coverImage.style.display = 'none';
    genresElement.textContent = '';
    ratingElement.textContent = 'N/A';
    totalEpisodesElement.textContent = 'N/A';
    document.getElementById('anime-id').value = '';
    document.getElementById('anime-title').value = '';
    document.getElementById('anime-cover').value = '';
    document.getElementById('anime-genre').value = '';
    document.getElementById('anime-total-episodes').value = '';

    episodeInput.disabled = true;
    chronologyInput.disabled = true;
    descriptionInput.disabled = true;
    franchiseInput.disabled = true;
    openingStartMinutes.disabled = true;
    openingStartSeconds.disabled = true;
    openingEndMinutes.disabled = true;
    openingEndSeconds.disabled = true;
    voiceoverSelect.disabled = true;

    suggestions.innerHTML = '';
    suggestions.style.display = 'none';

    submitBtn.disabled = true;

    const myDropzone = Dropzone.forElement("#video-dropzone");
    myDropzone.removeAllFiles(true);

    logElement.textContent = '';
    errorElement.textContent = '';

    // Сброс coverFile и отмена предыдущего запроса
    resetCover();
}

// Функция для получения статуса очереди
function getQueueStatus() {
    fetch(`${SERVER_URL}/queue-status`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        queueStatusElement.textContent = `Videos in queue: ${data.queue_length}`;
    })
    .catch(error => {
        console.error('Error fetching queue status:', error);
    });
}

// Запуск функций после загрузки документа
document.addEventListener('DOMContentLoaded', function() {
    getQueueStatus();
    setInterval(getQueueStatus, 5000);
});

// Добавление обработчиков событий для полей ввода
titleInput.addEventListener('input', checkFormValidity);
episodeInput.addEventListener('input', function() {
    if (episodeInput.value > 0) {
        openingStartMinutes.disabled = false;
        openingStartSeconds.disabled = false;
        checkFormValidity();
    }
});
episodeInput.addEventListener('input', checkFormValidity);
openingStartMinutes.addEventListener('input', function() {
    calculateOpeningEnd();
    checkFormValidity();
});
openingStartSeconds.addEventListener('input', function() {
    calculateOpeningEnd();
    checkFormValidity();
});
openingEndMinutes.addEventListener('input', checkFormValidity);
openingEndSeconds.addEventListener('input', checkFormValidity);
voiceoverSelect.addEventListener('change', checkFormValidity);