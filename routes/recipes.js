var express = require("express");
var router = express.Router();
const MySql = require("../routes/utils/MySql");
const DButils = require("../routes/utils/DButils");
const bcrypt = require("bcrypt");
const axios = require('axios');



// Middleware to log all requests
router.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

router.get("/", (req, res) => {
  console.log("Root route hit");
  res.send("Recipe router is working");
});

/**
 * This path is for searching a recipe
 */
// router.get("/search", async (req, res, next) => {
//   console.log("Search route hit");
//   try {
//     const { recipeName, cuisine, diet, intolerance, number = 5 } = req.query;
//     console.log(`Searching for recipes with: ${JSON.stringify(req.query)}`);
//     const results = await recipes_utils.searchRecipe(recipeName, cuisine, diet, intolerance, number);
//     res.json(results);
//   } catch (error) {
//     console.error("Error in search route:", error);
//     next(error);
//   }
// });

/**
 * This path returns full details of a recipe by its id
 */
// router.get("/:recipeId", async (req, res, next) => {
//   console.log(`Get recipe details route hit for id: ${req.params.recipeId}`);
//   try {
//     const recipe = await recipes_utils.getRecipeDetails(req.params.recipeId);
//     res.json(recipe);
//   } catch (error) {
//     console.error(`Error getting recipe details for id ${req.params.recipeId}:`, error);
//     next(error);
//   }
// });

/**
 * This path adds a recipe to user's favorites
 */
router.post("/favorites", async (req, res, next) => {
  try {
    // Check if the recipe is already in favorites
    const { username, recipeId } = req.body;
    
    console.log(`Adding favorite for user: ${username}, recipe: ${recipeId}`);

    let favorites = [];
    favorites = await DButils.execQuery(`SELECT recipe_id FROM favoriterecipes WHERE username='${username}'`);

    if (favorites.find((x) => x.recipe_id === recipeId))
      throw { status: 409, message: "Recipe already in favorites" };

    // Add the new favorite
    await DButils.execQuery(
      `INSERT INTO favoriterecipes (username, recipe_id) VALUES ('${username}', '${recipeId}')`
    );
    res.status(201).send({ message: "Recipe added to favorites", success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * This path removes a recipe from user's favorites
 */
router.delete("/favorites/:username/:recipeId", async (req, res, next) => {
  try {
    const { username, recipeId } = req.params;
    console.log(`Removing favorite for user: ${username}, recipe: ${recipeId}`);

    // Check if the favorite exists before attempting to delete
    let favorites = await DButils.execQuery(
      `SELECT recipe_id FROM favoriterecipes WHERE username='${username}' AND recipe_id='${recipeId}'`
    );

    if (favorites.length === 0) {
      throw { status: 404, message: "Favorite not found" };
    }

    // Remove the favorite
    await DButils.execQuery(
      `DELETE FROM favoriterecipes WHERE username='${username}' AND recipe_id='${recipeId}'`
    );

    res.status(200).send({ message: "Recipe removed from favorites", success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * This path retrieves a user's favorite recipes
 */

const SPOONACULAR_BASE_URL = 'https://api.spoonacular.com/recipes';
const SPOONACULAR_API_KEY = '5fefa3447258402db6c9155debd0e7e6';

router.get("/favorites/:username", async (req, res, next) => {
  try {
    const { username } = req.params;
    console.log(`Getting favorites for user: ${username}`);

    // Check if the user exists
    const users = await DButils.execQuery(`SELECT username FROM users WHERE username='${username}'`);
    if (users.length === 0) {
      throw { status: 404, message: "User not found" };
    }

    // Get the user's favorites
    const favorites = await DButils.execQuery(
      `SELECT recipe_id FROM favoriterecipes WHERE username='${username}'`
    );

    const favoriteRecipeIds = favorites.map(row => row.recipe_id);

    // Separate custom recipes and Spoonacular recipes
    const customRecipeIds = favoriteRecipeIds.filter(id => id.startsWith('000'));
    const spoonacularRecipeIds = favoriteRecipeIds.filter(id => !id.startsWith('000'));

    // Fetch custom recipes
    const customRecipes = await Promise.all(customRecipeIds.map(async (id) => {
      const [recipe] = await DButils.execQuery(`SELECT * FROM custom_recipes WHERE id='${id}'`);
      console.log(recipe)
      return {
        id: recipe.id,
        title: recipe.title,
        image: recipe.image,
        readyInMinutes: recipe.ready_in_minutes,
        aggregateLikes: recipe.aggregate_likes,
        vegan: recipe.vegan,
        vegetarian: recipe.vegetarian,
        glutenFree: recipe.gluten_free,
        instructions: recipe.instructions
      };
    }));

    // Fetch Spoonacular recipes
    let spoonacularRecipes = [];
    if (spoonacularRecipeIds.length > 0) {
      const response = await axios.get(`${SPOONACULAR_BASE_URL}/informationBulk`, {
        params: {
          ids: spoonacularRecipeIds.join(','),
          apiKey: SPOONACULAR_API_KEY
        }
      });
      spoonacularRecipes = response.data.map(recipe => ({
        id: recipe.id,
        title: recipe.title,
        image: recipe.image,
        readyInMinutes: recipe.readyInMinutes,
        aggregateLikes: recipe.aggregateLikes,
        vegan: recipe.vegan,
        vegetarian: recipe.vegetarian,
        glutenFree: recipe.glutenFree,
        instructions: recipe.instructions
      }));
    }

    // Combine custom and Spoonacular recipes
    const allFavoriteRecipes = [...customRecipes, ...spoonacularRecipes];

    res.status(200).send({
      message: "Favorites retrieved successfully",
      success: true,
      favorites: allFavoriteRecipes
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'An unexpected error occurred',
    success: false
  });
});

router.post("/custom", async (req, res, next) => {
  try {
    // Extract recipe details from request body, including instructions
    let recipe_details = {
      username: req.body.username, // Add this line to get the username
      title: req.body.title,
      image: req.body.image,
      readyInMinutes: req.body.readyInMinutes,
      aggregateLikes: req.body.aggregateLikes,
      vegan: req.body.vegan,
      vegetarian: req.body.vegetarian,
      glutenFree: req.body.glutenFree,
      instructions: req.body.instructions.join('\n\n') // Join instructions array into a single string
    };

    // Get all existing custom recipes
    let custom_recipes = [];
    custom_recipes = await DButils.execQuery("SELECT id FROM custom_recipes");

    // Generate new recipe ID
    let newRecipeNumber = 1;
    if (custom_recipes.length > 0) {
      const lastRecipeId = custom_recipes[custom_recipes.length - 1].id;
      newRecipeNumber = parseInt(lastRecipeId, 10) + 1;  // Ensure the id is correctly parsed as an integer
    }

    // Format new recipe ID with leading zeros (e.g., 0001, 0002, ...)
    const recipeId = newRecipeNumber.toString().padStart(4, '0');

    // Check if recipe ID already exists (unlikely, but good to check)
    if (custom_recipes.find((x) => x.id === recipeId))
      throw { status: 409, message: "Recipe ID already exists" };

    // Insert the new recipe including instructions as a single text block
    await DButils.execQuery(
      `INSERT INTO custom_recipes (id, username, title, image, ready_in_minutes, aggregate_likes, vegan, vegetarian, gluten_free, instructions) 
       VALUES ('${recipeId}', '${recipe_details.username}', '${recipe_details.title}', '${recipe_details.image}', ${recipe_details.readyInMinutes}, 
       ${recipe_details.aggregateLikes}, ${recipe_details.vegan}, ${recipe_details.vegetarian}, ${recipe_details.glutenFree}, '${recipe_details.instructions}')`
    );

    // Return the newly created recipe object in the response
    res.status(201).send({
      message: "Custom recipe created",
      success: true,
      recipe: {
        id: recipeId,
        title: recipe_details.title,
        image: recipe_details.image,
        readyInMinutes: recipe_details.readyInMinutes,
        aggregateLikes: recipe_details.aggregateLikes,
        vegan: recipe_details.vegan,
        vegetarian: recipe_details.vegetarian,
        glutenFree: recipe_details.glutenFree,
        instructions: recipe_details.instructions
      }
    });
  } catch (error) {
    next(error);
  }
});


router.get("/custom/:username", async (req, res, next) => {
  try {
    const { username } = req.params;

    const recipes = await DButils.execQuery(
      `SELECT * FROM custom_recipes WHERE username = '${username}'`
    );

    res.status(200).send({ 
      message: "Custom recipes retrieved successfully", 
      success: true, 
      recipes: recipes 
    });
  } catch (error) {
    next(error);
  }
});


const BASE_URL = 'https://api.spoonacular.com/recipes';
const API_KEY = '5fefa3447258402db6c9155debd0e7e6';

router.get('/search', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/complexSearch`, {
      params: {
        ...req.query,
        apiKey: API_KEY,
      },
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error searching recipes:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      message: 'An error occurred while searching for recipes', 
      error: error.response ? error.response.data : error.message,
      success: false 
    });
  }
});

router.get("/recipe/:recipeId", async (req, res, next) => {
  try {
    const { recipeId } = req.params;
    console.log(`Fetching full recipe details for id: ${recipeId}`);

    // Check if it's a custom recipe (ID starts with "000")
    if (recipeId.startsWith("000")) {
      console.log("ITS COSTUM",recipeId)
      // Fetch recipe from your custom_recipes table
      const customRecipe = await DButils.execQuery(
        `SELECT * FROM custom_recipes WHERE id='${recipeId}'`
      );

      if (customRecipe.length === 0) {
        throw { status: 404, message: "Custom recipe not found" };
      }

      // Return the custom recipe details
      res.status(200).json({
        message: "Custom recipe details retrieved successfully",
        success: true,
        data: customRecipe[0],
      });
    } else {
      console.log(`Fetching full recipe details for id: ${recipeId} FROM API`);

      // Fetch recipe from Spoonacular API if it's not a custom recipe
      const response = await axios.get(`${BASE_URL}/${recipeId}/information`, {
        params: {
          apiKey: API_KEY,
        },
      });
      console.log(`Fetching full recipe details for id: ${recipeId} FROM 22222`);
      console.log(response.data);

      // Return the Spoonacular recipe details
      res.status(200).json({
        message: "Recipe details retrieved successfully",
        success: true,
        data: response.data,
      });
    }
  } catch (error) {
    console.error(`Error fetching recipe details for id ${recipeId}:`, error.response ? error.response.data : error.message);
    res.status(500).json({
      message: 'An error occurred while fetching recipe details',
      error: error.response ? error.response.data : error.message,
      success: false,
    });
  }
});

router.get("/recipePreviews", async (req, res, next) => {
  try {
    const { number } = req.query;

    // Call the Spoonacular API to get random recipes
    const response = await axios.get(`${BASE_URL}/random`, {
      params: {
        number: number || 1, // Default to 1 if no number is provided
        apiKey: API_KEY,
      },
    });

    // Return only the data.recipes from the response
    res.status(200).json({
      message: "Recipe previews retrieved successfully",
      success: true,
      data: response.data.recipes,  // Send the recipes array to the frontend
    });
  } catch (error) {
    console.error('Error fetching recipe previews:', error.response ? error.response.data : error.message);
    res.status(500).json({
      message: 'An error occurred while fetching recipe previews',
      error: error.response ? error.response.data : error.message,
      success: false,
    });
  }
});


module.exports = router;