import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Get real-time weather information for a location")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("The city name, e.g., 'London' or 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Weather interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            return;
        }

        const city = interaction.options.getString("city");

        const geoResponse = await fetch(
            `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
        );
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            logger.info(`Weather command - city not found`, {
                userId: interaction.user.id,
                city: city,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Could not find a location for **${city}**. Please check the spelling.` });
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        const cityDisplay = name;

        const weatherResponse = await fetch(
            `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`,
        );
        const weatherData = await weatherResponse.json();

        if (weatherData.error) {
            logger.error(`Weather API error`, {
                error: weatherData.reason,
                city: city,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'A weather service error occurred.' });
            return;
        }

        const current = weatherData.current || {};
        const currentWeather = weatherData.current_weather || {};
        const rawTemp = current.temperature_2m ?? current.temperature ?? currentWeather.temperature;
        const temperature = rawTemp != null ? Math.round(rawTemp) : "N/A";
        const rawHumidity = current.relative_humidity_2m ?? current.relativehumidity ?? currentWeather.relativehumidity;
        const humidityDisplay = rawHumidity != null && rawHumidity !== "N/A" ? `${rawHumidity}%` : "N/A";
        const rawWind = current.wind_speed_10m ?? current.windspeed ?? currentWeather.windspeed;
        const windSpeed = rawWind != null ? Math.round(rawWind) : "N/A";
        const weatherCode = current.weather_code ?? current.weathercode ?? currentWeather.weathercode ?? currentWeather.weather_code ?? null;

        const condition = getWeatherDescription(weatherCode);

        const embed = createEmbed({ title: `Weather in ${cityDisplay}, ${country}`, description: condition.description })
            .addFields(
                {
                    name: "Temperature",
                    value: temperature === "N/A" ? "N/A" : `${temperature}°C`,
                    inline: true,
                },
                {
                    name: "Humidity",
                    value: humidityDisplay,
                    inline: true,
                },
                {
                    name: "Wind Speed",
                    value: windSpeed === "N/A" ? "N/A" : `${windSpeed} km/h`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Latitude: ${latitude.toFixed(2)} | Longitude: ${longitude.toFixed(2)}`,
            });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        logger.info(`Weather command executed`, {
            userId: interaction.user.id,
            city: cityDisplay,
            country: country,
            temperature: temperature,
            guildId: interaction.guildId
        });
    },
};

function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return { description: "Clear sky / Partly cloudy", emoji: "" };
    } else if (code >= 45 && code <= 48) {
        return { description: "Fog and Rime fog", emoji: "" };
    } else if (code >= 51 && code <= 67) {
        return { description: "Drizzle or Rain", emoji: "" };
    } else if (code >= 71 && code <= 75) {
        return { description: "Snow fall", emoji: "" };
    } else if (code >= 80 && code <= 86) {
        return { description: "Showers (Rain/Snow)", emoji: "" };
    } else if (code >= 95 && code <= 99) {
        return { description: "Thunderstorm", emoji: "" };
    }
    return { description: "Unknown conditions.", emoji: "" };
}