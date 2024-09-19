// script.js

const SERVER_URL = 'http://203.0.113.20:54559';
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

episodeInput.disabled = true;
chronologyInput.disabled = true;
descriptionInput.disabled = true;
franchiseInput.disabled = true;
openingStartMinutes.disabled = true;
openingStartSeconds.disabled = true;
openingEndMinutes.disabled = true;
openingEndSeconds.disabled = true;
voiceoverSelect.disabled = true;

function removeCharacterTags(text) {
    return text
        .replace(/\[.*?\]/g, '')  // Remove any content within square brackets
        .replace(/[\[\]]/g, '')   // Remove any remaining [ or ] characters
        .replace(/\s+([,.!?])/g, '$1')  // Remove space before punctuation
        .trim();
}

function cleanFranchiseData(franchiseDetails) {
    return franchiseDetails.nodes ? franchiseDetails.nodes.map(anime => ({
        id: anime.id,
        title: anime.name,
        date: anime.date
    })) : [];
}

function getFranchiseTitle(sortedFranchise, fallbackTitle) {
    return sortedFranchise.length > 0 ? sortedFranchise[0].title : fallbackTitle;  
}

function getChronologyNumber(sortedFranchise, selectedAnimeId) {
    return sortedFranchise.length > 0 ? sortedFranchise.findIndex(anime => anime.id === selectedAnimeId) + 1 : 1;  
}

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

                        coverImage.src = `https://shikimori.one${anime.image.original}`;
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

Dropzone.options.videoDropzone = {
    url: `${SERVER_URL}/upload`,
    maxFilesize: 3072,
    acceptedFiles: ".mp4,.avi,.mov",
    autoProcessQueue: false,
    maxFiles: 1,
    addRemoveLinks: true,
    timeout: 3600000,
    init: function () {
        const myDropzone = this;

        submitBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (myDropzone.getQueuedFiles().length > 0) {
                myDropzone.processQueue();
            } else {
                errorElement.textContent = "Please add a video before submitting.";
            }
        });

        this.on("addedfile", function (file) {
            console.log('File added:', file.name);
            checkFormValidity();
        });

        this.on("removedfile", function (file) {
            console.log('File removed:', file.name);
            checkFormValidity();
        });

        this.on("sending", function (file, xhr, formData) {
            formData.append("anime_id", document.getElementById('anime-id').value);
            formData.append("anime_title", document.getElementById('anime-title').value);
            formData.append("anime_cover", document.getElementById('anime-cover').value);
            formData.append("anime_genre", genresElement.textContent);
            formData.append("episode", episodeInput.value);
            formData.append("chronology", chronologyInput.value);
            formData.append("description", descriptionInput.value);
            formData.append("voiceover", voiceoverSelect.value);

            const openingStartTime = parseInt(openingStartMinutes.value) * 60 + parseInt(openingStartSeconds.value);
            const openingEndTime = parseInt(openingEndMinutes.value) * 60 + parseInt(openingEndSeconds.value);
            formData.append("opening_start", openingStartTime);
            formData.append("opening_end", openingEndTime);
        });

        this.on("success", function (file, response) {
            logElement.textContent = response.message || "Video uploaded successfully!";
            myDropzone.removeFile(file);
            resetForm();
        });

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
}

function getQueueStatus() {
    fetch(`${SERVER_URL}/queue-status`)
    .then(response => response.json())
    .then(data => {
        queueStatusElement.textContent = `Videos in queue: ${data.queue_length}`;
    })
    .catch(error => {
        console.error('Error fetching queue status:', error);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    getQueueStatus();
    setInterval(getQueueStatus, 5000);
});

// Add event listeners to input fields
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
