export const template = `
<div id="header" class="shadow-lr">
	<div id="header-content">
		<div id="logoContainer">
			<div>
				<img id="logo" src="./phetlogo.png"/>
			</div>
			<div id="logoContainerText">
				PhET Interactive Simulations
			</div>
		</div>
		<div id="translateSlogan">{{slogan}}</div>
	</div>
</div>
<div id="container">
	<div id='ractive-target'>
		<div class="language-container">
			{{#if languages.length > 1}}
				<label>
					<select value="{{selectedLanguage}}">
						{{#each languages}}
							<option value='{{this[0]}}'>{{this[1]}}</option>
						{{/each}}
					</select>
				</label>
			{{/if}}
			<label>
				<select value='{{selectedCategory}}'>
					<option value='all' id="translateAllCategories">All categories</option>
					{{#each categories}}
						<option value='{{makeCategoryId(.)}}'>{{makeCategoryName(.)}}</option>
					{{/each}}
				</select>
			</label>
		</div>
		<div class="card-cont">
			{{#each simulations}}
				<div class="sim-card" on-click='showConfirm'>
					<img loading="lazy" src="./{{id}}.png" alt="Screenshot of the {{display}}" />
					<div class="overlay">
						<i class="fa fa-info-circle" aria-hidden="true"></i>
						<h2>{{title}}</h2>
					</div>
				</div>
			{{/each}}
		</div>
	</div>
</div>
`
