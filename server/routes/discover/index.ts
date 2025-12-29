import { TMDB } from 'tmdb-ts';
import { trakt } from '#imports';

const tmdb = new TMDB(useRuntimeConfig().tmdbApiKey);

export default defineCachedEventHandler(
  async event => {
    const traktClient = trakt.current; // 🔥 THIS FIXES EVERYTHING

    const popular = { movies: [], shows: [] };

    popular.movies.push(
      ...(data => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(
        await tmdb.movies.popular()
      )
    );

    popular.shows.push(
      ...(data => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(
        await tmdb.tvShows.popular()
      )
    );

    const genres = {
      movies: await tmdb.genres.movies(),
      shows: await tmdb.genres.tvShows(),
    };

    const topRated = {
      movies: await tmdb.movies.topRated(),
      shows: await tmdb.tvShows.topRated(),
    };

    const nowPlaying = {
      movies: (await tmdb.movies.nowPlaying()).results.sort(
        (a, b) => b.vote_average - a.vote_average
      ),
      shows: (await tmdb.tvShows.onTheAir()).results.sort(
        (a, b) => b.vote_average - a.vote_average
      ),
    };

    let lists: any[] = [];

    const internalLists = {
      trending: await traktClient.lists.trending(),
      popular: await traktClient.lists.popular(),
    };

    for (let i = 0; i < internalLists.trending.length; i++) {
      const items = await traktClient.lists.items({
        id: internalLists.trending[i].list.ids.trakt,
        type: 'all',
      });

      lists.push({
        name: internalLists.trending[i].list.name,
        likes: internalLists.trending[i].like_count,
        items: [],
      });

      for (const item of items) {
        if (item.movie?.ids?.tmdb) {
          lists[i].items.push({
            type: 'movie',
            name: item.movie.title,
            id: item.movie.ids.tmdb,
            year: item.movie.year,
          });
        } else if (item.show?.ids?.tmdb) {
          lists[i].items.push({
            type: 'show',
            name: item.show.title,
            id: item.show.ids.tmdb,
            year: item.show.year,
          });
        }
      }
    }

    for (let i = 0; i < internalLists.popular.length; i++) {
      const items = await traktClient.lists.items({
        id: internalLists.popular[i].list.ids.trakt,
        type: 'all',
      });

      lists.push({
        name: internalLists.popular[i].list.name,
        likes: internalLists.popular[i].like_count,
        items: [],
      });

      for (const item of items) {
        if (item.movie?.ids?.tmdb) {
          lists.at(-1)!.items.push({
            type: 'movie',
            name: item.movie.title,
            id: item.movie.ids.tmdb,
            year: item.movie.year,
          });
        } else if (item.show?.ids?.tmdb) {
          lists.at(-1)!.items.push({
            type: 'show',
            name: item.show.title,
            id: item.show.ids.tmdb,
            year: item.show.year,
          });
        }
      }
    }

    const trending = await traktClient.movies.popular();
    const mostWatched = await traktClient.movies.watched();
    const lastWeekend = await traktClient.movies.boxoffice();

    return {
      mostWatched,
      lastWeekend,
      trending,
      popular,
      topRated,
      nowPlaying,
      genres,
      traktLists: lists,
    };
  },
  {
    maxAge: process.env.NODE_ENV === 'production' ? 60 * 60 : 0,
  }
);
